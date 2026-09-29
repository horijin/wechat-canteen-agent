const app = getApp()

Page({
  data: {
    messages: [
      {
        id: 1,
        sender: 'ai',
        text: '你好！我是食堂 AI 选菜助手。你可以告诉我你想吃什么风味（清淡/辣/盖饭/面食），或者预算与营养需求，我来为你推荐！',
        dishes: []
      }
    ],
    inputValue: '',
    hasInput: false,
    thinking: false,
    scrollToView: '',
    hints: [
      '推荐 15 元左右的盖浇饭',
      '给我番茄鸡蛋盖饭的营养数据',
      '有推荐的高蛋白质菜品吗？'
    ],

    showCartDrawer: false,
    cartList: [],
    totalCartCount: 0,
    totalCartPrice: "0.00"
  },

  onShow() {
    this.refreshCartData()
  },

  onInput(e) {
    const val = e.detail.value
    this.setData({
      inputValue: val,
      hasInput: val.trim().length > 0
    })
  },

  useHint(e) {
    const text = e.currentTarget.dataset.text
    this.setData({ 
      inputValue: text,
      hasInput: true 
    })
  },

  /**
   * 构造上报给后端的大模型对话历史上下文
   */
  buildHistoryPayload() {
    const history = []
    // 提取最近最多 6 条历史消息，过滤掉思考中或非标消息
    const validMsgs = this.data.messages.filter(m => m.text && (m.sender === 'user' || m.sender === 'ai'))
    const recentMsgs = validMsgs.slice(-6)

    recentMsgs.forEach(m => {
      history.push({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.text
      })
    })

    return history
  },

  async sendMessage() {
    const text = this.data.inputValue.trim()
    if (!text || this.data.thinking) return

    const userMsgId = Date.now()
    const newMessages = [
      ...this.data.messages,
      { id: userMsgId, sender: 'user', text, dishes: [] }
    ]

    this.setData({
      messages: newMessages,
      inputValue: '',
      hasInput: false,
      scrollToView: `msg-${userMsgId}`,
      thinking: true
    })

    try {
      // 获取全局用户信息中的学号
      const userInfo = app.globalData?.userInfo || {}
      const customerNo = userInfo.customer_no || "20230001"

      // 构建多轮对话 payload
      const payload = {
        message: text,
        customer_no: customerNo,
        cart: app.globalData?.cartMap || {},
        history: this.buildHistoryPayload()
      }

      // 统一 request 对象的标准调用方式
      const res = await app.request({
        url: '/api/ai/chat',
        method: 'POST',
        data: payload
      })

      console.log('AI API Response:', res)

      const replyText = res?.reply || '为您找到以下菜品参考：'
      
      let recommendedDishes = []
      if (Array.isArray(res?.dishes) && res.dishes.length > 0) {
        recommendedDishes = res.dishes
      } else if (res?.dish) {
        recommendedDishes = [res.dish]
      }

      const aiMsgId = Date.now() + 1
      const aiResponse = {
        id: aiMsgId,
        sender: 'ai',
        text: replyText,
        dishes: recommendedDishes
      }

      this.setData({
        messages: [...this.data.messages, aiResponse],
        scrollToView: `msg-${aiMsgId}`
      })

    } catch (err) {
      console.error("AI 接口调用失败:", err)
      const errorMsgId = Date.now() + 1
      this.setData({
        messages: [
          ...this.data.messages,
          { id: errorMsgId, sender: 'ai', text: '网络异常，请稍后重试~', dishes: [] }
        ],
        scrollToView: `msg-${errorMsgId}`
      })
    } finally {
      this.setData({ thinking: false })
    }
  },

  /**
   * 将单菜品加入购物车
   */
  addToCartFromAI(e) {
    const dish = e.currentTarget.dataset.dish
    if (!dish) return

    this.doAddToCart(dish)

    wx.showToast({
      title: '已加入购物车',
      icon: 'success'
    })
  },

  /**
   * 一键加购套餐（多菜品组合）
   */
  addAllToCart(e) {
    const dishes = e.currentTarget.dataset.dishes
    if (!Array.isArray(dishes) || dishes.length === 0) return

    dishes.forEach(d => this.doAddToCart(d))

    wx.showToast({
      title: `全套${dishes.length}件已加购`,
      icon: 'success'
    })
  },

  /**
   * 购物车核心追加逻辑
   */
  doAddToCart(dish) {
    const cartMap = app.globalData?.cartMap || {}
    const menuId = dish.daily_menu_id || dish.id
    const key = String(menuId)

    if (cartMap[key]) {
      cartMap[key].quantity += 1
    } else {
      cartMap[key] = {
        daily_menu_id: Number(menuId),
        id: dish.id,
        name: dish.name || dish.dish_name || '推荐菜品',
        price: Number(dish.price || 0),
        stall_id: dish.stall_id || 1,
        stall_name: dish.stall_name || '食堂档口',
        quantity: 1
      }
    }

    if (app.globalData) {
      app.globalData.cartMap = cartMap
    }
    this.refreshCartData()
  },

  refreshCartData() {
    const cartMap = app.globalData?.cartMap || {}
    const cartList = Object.values(cartMap)
      .filter(x => x && x.quantity > 0)
      .map(item => ({
        ...item,
        name: item.name || item.dish_name || item.title || '推荐菜品'
      }))

    let totalCount = 0
    let totalPrice = 0

    cartList.forEach(item => {
      totalCount += item.quantity
      totalPrice += (Number(item.price) || 0) * item.quantity
    })

    this.setData({
      cartList,
      totalCartCount: totalCount,
      totalCartPrice: totalPrice.toFixed(2)
    })
  },

  toggleCartDrawer() {
    this.setData({ showCartDrawer: !this.data.showCartDrawer })
  },

  updateCartQty(e) {
    const id = String(e.currentTarget.dataset.id)
    const delta = Number(e.currentTarget.dataset.delta)
    const cartMap = app.globalData?.cartMap || {}

    if (cartMap[id]) {
      cartMap[id].quantity += delta
      if (cartMap[id].quantity <= 0) {
        delete cartMap[id]
      }
    }

    if (app.globalData) {
      app.globalData.cartMap = cartMap
    }
    this.refreshCartData()
  },

  clearCart() {
    if (app.globalData) {
      app.globalData.cartMap = {}
    }
    this.refreshCartData()
  },

  /**
   * AI 聊天页下单与跳转
   */
  async goToCheckout() {
    const cartList = this.data.cartList
    if (!cartList || cartList.length === 0) {
      wx.showToast({ title: '购物车是空的', icon: 'none' })
      return
    }

    // 按档口分组（跨档口拆单提交）
    const stallGroups = {}
    cartList.forEach(item => {
      const stallId = item.stall_id || 1
      if (!stallGroups[stallId]) {
        stallGroups[stallId] = []
      }
      stallGroups[stallId].push({
        daily_menu_id: item.daily_menu_id,
        quantity: item.quantity
      })
    })

    const stallIds = Object.keys(stallGroups)
    const userInfo = app.globalData?.userInfo || {
      customer_name: "测试学生",
      customer_no: "20230001"
    }

    try {
      wx.showLoading({ title: '正在提交订单...', mask: true })

      // 统一为对象式传参
      const orderPromises = stallIds.map(stallId => {
        const payload = {
          customer_name: userInfo.customer_name,
          customer_no: userInfo.customer_no,
          dining_type: "dine_in",
          requested_pickup_time: null,
          note: "",
          items: stallGroups[stallId]
        }
        return app.request({
          url: '/api/orders',
          method: 'POST',
          data: payload
        })
      })

      const results = await Promise.all(orderPromises)

      wx.hideLoading()
      wx.showToast({ 
        title: stallIds.length > 1 ? `混合下单成功(拆分${stallIds.length}单)` : '下单成功！', 
        icon: 'success' 
      })

      // 清空购物车
      if (app.globalData) {
        app.globalData.cartMap = {}
      }
      this.refreshCartData()
      this.setData({ showCartDrawer: false })

      // 获取创建成功的首个订单 ID，带参跳转
      const firstOrderId = results && results[0] ? results[0].id : null
      const targetUrl = firstOrderId ? `/pages/order/order?id=${firstOrderId}` : '/pages/order/order'

      setTimeout(() => {
        wx.navigateTo({ url: targetUrl })
      }, 1200)

    } catch (err) {
      wx.hideLoading()
      console.error("AI 购物车下单失败:", err)

      let msg = "下单失败，请重试"
      if (typeof err === 'string') msg = err
      else if (err?.message) msg = err.message
      else if (err?.data?.detail) msg = typeof err.data.detail === 'string' ? err.data.detail : '参数校验错误'

      wx.showToast({ title: msg, icon: 'none' })
    }
  }
})