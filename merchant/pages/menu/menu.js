const menuService = require("../../services/menu")
const { MEAL_PERIODS } = require("../../utils/constants")
const { formatDate, money } = require("../../utils/format")
const { absoluteAssetUrl } = require("../../utils/request")

function firstValue(object, keys, fallback) {
  for (const key of keys) {
    if (object && object[key] !== undefined && object[key] !== null) return object[key]
  }
  return fallback
}

// 合并菜品库与已发布菜单项
function mergeRows(dishes, menus) {
  const menuMap = {}
  ;(menus || []).forEach(item => { menuMap[item.dish_id] = item })
  
  const rows = (dishes || []).map(dish => {
    const menu = menuMap[dish.id]
    const price = menu ? menu.price : firstValue(dish, ["price", "default_price"], 0)
    const image = firstValue(dish, ["image_url", "image"], "")
    const isPublished = Boolean(menu) // 是否已发布到当前餐次

    return {
      dishId: dish.id,
      menuId: menu ? menu.id : 0,
      name: dish.name,
      description: dish.description || "暂无菜品描述",
      imageUrl: absoluteAssetUrl(image),
      energyKcal: dish.energy_kcal || 0,
      included: isPublished,  // 与 existing 保持同步，标记是否处于当前餐次菜单中
      existing: isPublished,  // 标记是否已发布
      price: money(price),
      stock: Number(menu ? menu.stock : 20),
      available: menu ? Boolean(menu.is_available) : true
    }
  })
  // 按照“已发布优先”和“dishId”排序
  return rows.sort((a, b) => Number(b.existing) - Number(a.existing) || a.dishId - b.dishId)
}

Page({
  data: {
    session: {},
    date: "",
    mealPeriods: MEAL_PERIODS,
    mealPeriod: "lunch",
    rows: [],
    loading: true,
    busyMenuId: 0,
    error: "",
    summary: { included: 0, available: 0, stock: 0 }
  },

  onLoad() {
    const session = getApp().requireSession()
    if (!session) return
    this.setData({ session, date: formatDate() })
  },

  onShow() {
    const session = getApp().requireSession()
    if (!session) return
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    this.setData({ session })
    this.loadMenu()
  },

  async loadMenu() {
    if (this._loading) {
      this._reloadQueued = true
      return
    }
    if (!this.data.session.stallId) return
    this._loading = true
    this.setData({ loading: true, error: "" })
    try {
      const results = await Promise.all([
        menuService.listDishes(this.data.session.stallId),
        menuService.getMenu(this.data.session.stallId, this.data.date, this.data.mealPeriod)
      ])
      const dishes = results[0]
      const menus = results[1]
      this.setData({ rows: mergeRows(dishes, menus) })
      this.updateSummary()
    } catch (error) {
      this.setData({ error: error.message })
    } finally {
      this._loading = false
      this.setData({ loading: false })
      wx.stopPullDownRefresh()
      if (this._reloadQueued) {
        this._reloadQueued = false
        this.loadMenu()
      }
    }
  },

  onPullDownRefresh() { this.loadMenu() },

  chooseDate(event) {
    this.setData({ date: event.detail.value })
    this.loadMenu()
  },

  chooseMeal(event) {
    const mealPeriod = event.currentTarget.dataset.period
    if (mealPeriod === this.data.mealPeriod) return
    this.setData({ mealPeriod })
    this.loadMenu()
  },

  // 1. 勾选开关：将菜品新增/发布到当前餐次
  async toggleIncluded(event) {
    const index = Number(event.currentTarget.dataset.index)
    const row = this.data.rows[index]
    const included = event.detail.value

    if (row.existing) return

    const price = Number(row.price)
    if (!Number.isFinite(price) || price < 0) {
      wx.showToast({ title: "价格无效", icon: "none" })
      this.setData({ [`rows[${index}].included`]: false })
      return
    }

    wx.showLoading({ title: "正在加入菜单..." })
    try {
      const existingItems = this.data.rows.filter(item => item.existing)
      const newItems = [
        ...existingItems,
        { ...row, included: true, available: true }
      ]

      await menuService.publishMenu(this.data.session.stallId, {
        service_date: this.data.date,
        meal_period: this.data.mealPeriod,
        items: newItems.map(item => ({
          dish_id: item.dishId,
          price: Number(item.price).toFixed(2),
          stock: Number(item.stock),
          is_available: Boolean(item.available)
        }))
      })

      // 重新加载页面数据，确保和后端最新数据完全一致
      await this.loadMenu()
      wx.showToast({ title: "已加入当前餐次" })
    } catch (error) {
      this.setData({ [`rows[${index}].included`]: false })
      wx.showToast({ title: error.message || "加入失败", icon: "none" })
    } finally {
      wx.hideLoading()
    }
  },

  inputField(event) {
    const index = Number(event.currentTarget.dataset.index)
    const field = event.currentTarget.dataset.field
    this.setData({ [`rows[${index}].${field}`]: event.detail.value })
    this.updateSummary()
  },

  // 2. 价格输入框失焦同步
  async commitPrice(event) {
    const index = Number(event.currentTarget.dataset.index)
    const row = this.data.rows[index]
    if (!row || !row.menuId) return

    const price = Number(row.price)
    if (!Number.isFinite(price) || price < 0) {
      wx.showToast({ title: "价格无效", icon: "none" })
      return
    }

    this.setData({ busyMenuId: row.menuId })
    try {
      await menuService.updateMenuItem(row.menuId, { price: price.toFixed(2) })
      wx.showToast({ title: "价格已更新", icon: "none" })
    } catch (error) {
      wx.showToast({ title: error.message || "更新失败", icon: "none" })
      await this.loadMenu()
    } finally {
      this.setData({ busyMenuId: 0 })
    }
  },

  // 3. 正常供应 / 停售（开关）
  async toggleAvailable(event) {
    const index = Number(event.currentTarget.dataset.index)
    const row = this.data.rows[index]
    const available = event.detail.value
    this.setData({ [`rows[${index}].available`]: available })
    this.updateSummary()
    if (!row.menuId) return
    this.setData({ busyMenuId: row.menuId })
    try {
      await menuService.updateMenuItem(row.menuId, { is_available: available })
      wx.showToast({ title: available ? "已恢复供应" : "已设为停售", icon: "none" })
    } catch (error) {
      this.setData({ [`rows[${index}].available`]: !available })
      this.updateSummary()
      wx.showToast({ title: error.message, icon: "none" })
    } finally {
      this.setData({ busyMenuId: 0 })
    }
  },

  // 4. 库存步进器按键修改
  changeStock(event) {
    const index = Number(event.currentTarget.dataset.index)
    const delta = Number(event.currentTarget.dataset.delta)
    const row = this.data.rows[index]
    const stock = Math.max(0, Math.floor(Number(row.stock || 0) + delta))
    this.setData({ [`rows[${index}].stock`]: stock })
    this.updateSummary()
    if (row.menuId) this.commitStockDirect(index, stock)
  },

  // 5. 库存输入框失焦同步
  commitStockBlur(event) {
    const index = Number(event.currentTarget.dataset.index)
    const row = this.data.rows[index]
    if (!row || !row.menuId) return
    const stock = Math.max(0, Math.floor(Number(row.stock || 0)))
    this.commitStockDirect(index, stock)
  },

  // 6. 底层通用库存更新操作
  async commitStockDirect(index, stock) {
    const row = this.data.rows[index]
    if (!row || !row.menuId || this.data.busyMenuId) return
    this.setData({ busyMenuId: row.menuId })
    try {
      await menuService.updateMenuItem(row.menuId, { stock })
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" })
      await this.loadMenu()
    } finally {
      this.setData({ busyMenuId: 0 })
    }
  },

  // 更新顶部汇总信息（只统计“已发布”的菜品）
  updateSummary() {
    const publishedRows = this.data.rows.filter(item => item.existing)
    this.setData({
      summary: {
        included: publishedRows.length,
        available: publishedRows.filter(item => item.available).length,
        stock: publishedRows.reduce((total, item) => total + Math.max(0, Number(item.stock || 0)), 0)
      }
    })
  },

  // 7. 下架菜品
  async unpublishDish(event) {
    const index = Number(event.currentTarget.dataset.index)
    const row = this.data.rows[index]
    
    if (!row.menuId) return
  
    const confirm = await new Promise(resolve => {
      wx.showModal({
        title: '确认下架',
        content: `确定要将“${row.name}”从当前餐次菜单中下架吗？`,
        confirmText: '确认下架',
        confirmColor: '#d93025',
        success: res => resolve(res.confirm)
      })
    })
  
    if (!confirm) return
  
    wx.showLoading({ title: '正在下架…' })
  
    try {
      // 调用单条下架/删除接口
      await menuService.deleteMenuItem(row.menuId)
  
      // 重新加载页面数据
      await this.loadMenu()
  
      wx.showToast({ title: "已下架", icon: "success" })
    } catch (error) {
      wx.showToast({ title: error.message || "下架失败", icon: "none" })
    } finally {
      wx.hideLoading()
    }
  }
})
