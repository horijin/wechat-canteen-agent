const orderService = require("../../services/orders")
const { STATUS_TEXT, STATUS_TONE, NEXT_ACTION, ORDER_FILTERS, ACTIVE_STATUSES } = require("../../utils/constants")
const { formatDate, formatDateTime, money } = require("../../utils/format")
const { getPreferences } = require("../../utils/storage")
const env = require("../../config/env")

function decorate(order) {
  const next = NEXT_ACTION[order.status] || {}
  return Object.assign({}, order, {
    _statusText: STATUS_TEXT[order.status] || order.status,
    _tone: STATUS_TONE[order.status] || "neutral",
    _nextStatus: next.status || "",
    _nextText: next.text || "",
    _diningText: order.dining_type === "takeaway" ? "打包" : "堂食",
    _createdAt: formatDateTime(order.created_at),
    _amount: money(order.total_amount)
  })
}

function matchFilter(order, filter) {
  if (filter === "all") return true
  if (filter === "active") return ACTIVE_STATUSES.includes(order.status)
  if (filter === "preparing") return order.status === "accepted" || order.status === "preparing"
  return order.status === filter
}

Page({
  data: {
    session: {},
    date: "",
    filter: "active",
    filters: ORDER_FILTERS,
    allOrders: [],
    orders: [],
    loading: true,
    error: "",
    busyOrderId: 0,
    lastUpdated: ""
  },

  onLoad() {
    const session = getApp().requireSession()
    if (!session) return
    this._knownPendingIds = null
    this.setData({ session, date: formatDate() })
  },

  onShow() {
    const session = getApp().requireSession()
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    if (!session) return
    const once = wx.getStorageSync("merchant_order_filter_once")
    if (once) wx.removeStorageSync("merchant_order_filter_once")
    this.setData({ session, filter: once || this.data.filter })
    this.refresh()
    this.stopPolling()
    this._timer = setInterval(() => this.refresh(true), env.orderPollingMs)
  },

  onHide() { this.stopPolling() },
  onUnload() { this.stopPolling() },

  stopPolling() {
    if (this._timer) clearInterval(this._timer)
    this._timer = null
  },

  applyFilter(allOrders, filter = this.data.filter) {
    const orders = allOrders.filter(item => matchFilter(item, filter))
    const filters = ORDER_FILTERS.map(item => ({
      key: item.key,
      name: item.name,
      count: allOrders.filter(order => matchFilter(order, item.key)).length
    }))
    this.setData({ allOrders, orders, filters, filter })
  },

  async refresh(silent = false) {
    if (this._refreshing) {
      if (!silent) this._reloadQueued = true
      return
    }
    if (!this.data.session.stallId) return
    this._refreshing = true
    if (!silent) this.setData({ loading: true, error: "" })
    try {
      const result = await orderService.listOrders(this.data.session.stallId, { date: this.data.date })
      const allOrders = (result || []).map(decorate)
      const pendingIds = allOrders.filter(item => item.status === "pending").map(item => item.id)
      if (this._knownPendingIds && pendingIds.some(id => !this._knownPendingIds.includes(id))) {
        if (getPreferences().vibrateOnNewOrder) wx.vibrateShort({ type: "medium" })
        wx.showToast({ title: "收到新订单", icon: "none" })
      }
      this._knownPendingIds = pendingIds
      this.applyFilter(allOrders)
      const now = new Date()
      this.setData({
        error: "",
        lastUpdated: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`
      })
    } catch (error) {
      if (!silent) this.setData({ error: error.message })
    } finally {
      this._refreshing = false
      if (!silent) this.setData({ loading: false })
      wx.stopPullDownRefresh()
      if (this._reloadQueued) {
        this._reloadQueued = false
        this.refresh()
      }
    }
  },

  onPullDownRefresh() { this.refresh() },

  chooseDate(event) {
    this._knownPendingIds = null
    this.setData({ date: event.detail.value })
    this.refresh()
  },

  chooseFilter(event) {
    const filter = event.currentTarget.dataset.status
    this.applyFilter(this.data.allOrders, filter)
  },

  openDetail(event) {
    wx.navigateTo({ url: `/pages/order-detail/order-detail?id=${event.detail.id}` })
  },

  async advance(event) {
    const { id, status } = event.detail
    if (this.data.busyOrderId) return
    this.setData({ busyOrderId: id })
    try {
      await orderService.updateOrderStatus(id, status)
      wx.showToast({ title: "状态已更新" })
      await this.refresh(true)
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" })
      await this.refresh(true)
    } finally {
      this.setData({ busyOrderId: 0 })
    }
  },

  cancel(event) {
    const id = event.detail.id
    wx.showModal({
      title: "取消订单",
      content: "订单取消后不能恢复，确定继续吗？",
      confirmColor: "#c8422e",
      success: async result => {
        if (!result.confirm || this.data.busyOrderId) return
        this.setData({ busyOrderId: id })
        try {
          await orderService.updateOrderStatus(id, "cancelled")
          wx.showToast({ title: "订单已取消", icon: "none" })
          await this.refresh(true)
        } catch (error) {
          wx.showToast({ title: error.message, icon: "none" })
          await this.refresh(true)
        } finally {
          this.setData({ busyOrderId: 0 })
        }
      }
    })
  }
})
