const app = getApp()

Page({
  data: {
    canteens: [],
    selectedCanteenId: null,
    stalls: [],          
    currentStallId: null, 
    currentStallName: '', 

    dailyMenuList: [],   
    loading: false,

    serviceDate: '',     
    mealPeriod: 'lunch', 

    cartMap: {},
    cartList: [],       
    totalCount: 0,
    totalPrice: 0,

    showCartDrawer: false, 
    diningType: 'dine_in',

    showDishDetail: false,
    selectedDish: null
  },

  onLoad() {
    this.initDefaultDate()
    this.loadCanteensAndStalls()
  },

  onShow() {
    const globalCartMap = app.globalData.cartMap || {}
    this.recalculateCart(globalCartMap)
  },

  initDefaultDate() {
    this.setData({
      serviceDate: app.today()
    });
  },

  async loadCanteensAndStalls() {
    try {
      this.setData({ loading: true })
      const canteens = await app.request('/api/canteens')
      if (!canteens || canteens.length === 0) return

      const defaultCanteen = canteens[0]
      this.setData({ canteens, selectedCanteenId: defaultCanteen.id })
      await this.loadStalls(defaultCanteen.id)
    } catch (err) {
      console.error("加载食堂失败:", err)
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadStalls(canteenId) {
    try {
      const stalls = await app.request(`/api/canteens/${canteenId}/stalls`)
      this.setData({ stalls })

      if (stalls && stalls.length > 0) {
        this.switchStall(stalls[0])
      } else {
        this.setData({ dailyMenuList: [] })
      }
    } catch (err) {
      console.error("加载档口失败:", err)
    }
  },

  onSelectCanteen(e) {
    const canteenId = e.currentTarget.dataset.id
    if (canteenId === this.data.selectedCanteenId) return
    this.setData({ selectedCanteenId: canteenId })
    this.loadStalls(canteenId)
  },

  onSelectStall(e) {
    const stallId = e.currentTarget.dataset.id
    const stall = this.data.stalls.find(s => s.id === stallId)
    if (stall) this.switchStall(stall)
  },

  async switchStall(stall) {
    this.setData({ 
      currentStallId: stall.id,
      currentStallName: stall.name 
    })
    await this.loadDailyMenu(stall.id)
  },

  async loadDailyMenu(stallId) {
    this.setData({ loading: true })
    try {
      const res = await app.request(
        `/api/stalls/${stallId}/menu?date=${this.data.serviceDate}&meal_period=${this.data.mealPeriod}`
      )
      
      const baseUrl = app.globalData.baseUrl || ''

      const dailyMenuList = (res || []).map(item => {
        let rawImage = item.dish?.image_url || ''
        if (rawImage && rawImage.startsWith('/')) {
          rawImage = `${baseUrl}${rawImage}`
        }

        return {
          id: item.id, 
          dish_id: item.dish_id,
          name: item.dish?.name || '未知菜品',
          description: item.dish?.description || '',
          image_url: rawImage || '/static/dishes/default-food.png',
          price: Number(item.price),
          stock: item.stock,
          is_available: item.is_available,
          energy_kcal: item.dish?.energy_kcal || item.energy_kcal || 580,
          nutrition: item.dish?.nutrition || item.nutrition || {
            protein_g: 28.5,
            fat_g: 16.0,
            carbs_g: 65.0,
            sodium_mg: 520
          }
        }
      })

      this.setData({ dailyMenuList })
    } catch (err) {
      console.error("加载菜单失败:", err)
    } finally {
      this.setData({ loading: false })
    }
  },

  onOpenDishDetail(e) {
    const { item } = e.currentTarget.dataset
    if (!item) return
    this.setData({
      selectedDish: item,
      showDishDetail: true
    })
  },

  onCloseDishDetail() {
    this.setData({
      showDishDetail: false
    })
  },

  onUpdateQuantity(e) {
    const { item, delta } = e.currentTarget.dataset
    if (!item) return

    const currentCanteen = this.data.canteens.find(c => c.id === this.data.selectedCanteenId)
    
    this.updateCartItem({
      daily_menu_id: item.id || item.daily_menu_id,
      stall_id: this.data.currentStallId || item.stall_id,
      stall_name: this.data.currentStallName || item.stall_name,
      canteen_name: currentCanteen ? currentCanteen.name : (item.canteen_name || '食堂'),
      dish_name: item.name || item.dish_name,
      price: item.price,
      stock: item.stock,
      image_url: item.image_url
    }, delta)

    if (this.data.showDishDetail) {
      this.setData({
        showDishDetail: false
      })
    }
  },

  onUpdateCartQuantityByMenuId(e) {
    const { menuid, delta } = e.currentTarget.dataset
    const item = this.data.cartMap[menuid]
    if (item) {
      this.updateCartItem(item, delta)
    }
  },

  updateCartItem(cartNode, delta) {
    const cartMap = { ...this.data.cartMap }
    const menuId = cartNode.daily_menu_id
    const currentQty = cartMap[menuId] ? cartMap[menuId].quantity : 0
    const newQty = currentQty + delta

    if (newQty <= 0) {
      delete cartMap[menuId]
    } else {
      if (newQty > cartNode.stock) {
        wx.showToast({ title: '已超出库存上限', icon: 'none' })
        return
      }
      cartMap[menuId] = {
        ...cartNode,
        quantity: newQty
      }
    }

    this.recalculateCart(cartMap)
  },

  recalculateCart(cartMap) {
    let totalCount = 0
    let totalPrice = 0
    const cartList = Object.values(cartMap)

    cartList.forEach(item => {
      totalCount += item.quantity
      totalPrice += item.price * item.quantity
    })

    const showCartDrawer = totalCount === 0 ? false : this.data.showCartDrawer

    app.globalData.cartMap = cartMap

    this.setData({
      cartMap,
      cartList,
      totalCount,
      totalPrice: Number(totalPrice.toFixed(2)),
      showCartDrawer
    })
  },

  toggleCartDrawer() {
    if (this.data.totalCount === 0) return
    this.setData({ showCartDrawer: !this.data.showCartDrawer })
  },

  closeAllMasks() {
    this.setData({
      showCartDrawer: false,
      showDishDetail: false
    })
  },

  goToAIChat() {
    wx.navigateTo({
      url: '/pages/ai-chat/ai-chat',
      fail: (err) => {
        console.error("跳转 AI 对话失败：", err)
      }
    })
  },

  onClearCart() {
    wx.showModal({
      title: '提示',
      content: '确定要清空购物车吗？',
      success: (res) => {
        if (res.confirm) {
          app.globalData.cartMap = {}
          this.recalculateCart({})
        }
      }
    })
  },

  // 双列菜单栏提交订单与精准跳转
  async onSubmitOrder() {
    if (this.data.totalCount === 0) return

    const cartList = Object.values(this.data.cartMap)
    
    const stallGroups = {}
    cartList.forEach(item => {
      if (!stallGroups[item.stall_id]) {
        stallGroups[item.stall_id] = []
      }
      stallGroups[item.stall_id].push({
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

      const orderPromises = stallIds.map(stallId => {
        const payload = {
          customer_name: userInfo.customer_name,
          customer_no: userInfo.customer_no,
          dining_type: this.data.diningType,
          requested_pickup_time: null,
          note: "",
          items: stallGroups[stallId]
        }
        return app.request('/api/orders', 'POST', payload)
      })

      const results = await Promise.all(orderPromises)

      wx.hideLoading()
      wx.showToast({ 
        title: stallIds.length > 1 ? `混合下单成功(拆分${stallIds.length}单)` : '下单成功！', 
        icon: 'success' 
      })

      app.globalData.cartMap = {}
      this.recalculateCart({})

      // 获取创建成功的首个订单 ID，跳转到等候订单叫号页
      const firstOrderId = results && results[0] ? results[0].id : null
      const targetUrl = firstOrderId ? `/pages/order/order?id=${firstOrderId}` : '/pages/order/order'

      setTimeout(() => {
        wx.navigateTo({ url: targetUrl })
      }, 1200)

    } catch (err) {
      wx.hideLoading()
      console.error("下单失败原因:", err)

      let msg = "下单失败，请重试"
      if (typeof err === 'string') msg = err
      else if (err?.message) msg = err.message
      else if (err?.data?.detail) msg = typeof err.data.detail === 'string' ? err.data.detail : '参数校验错误'

      wx.showToast({ title: msg, icon: 'none' })
    }
  }
})
