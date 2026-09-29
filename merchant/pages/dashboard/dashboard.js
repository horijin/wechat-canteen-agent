const orderService = require("../../services/orders")
const merchantService = require("../../services/merchant")
const constants = require("../../utils/constants") || {}
const { STATUS_TEXT = {}, STATUS_TONE = {}, NEXT_ACTION = {}, ACTIVE_STATUSES = [] } = constants
const format = require("../../utils/format") || {}
const { formatDate, formatDateTime, money, sum } = format
const storage = require("../../utils/storage") || {}
const env = require("../../config/env") || {}

const safeFormatDate = typeof formatDate === 'function' ? formatDate : () => ""
const safeFormatDateTime = typeof formatDateTime === 'function' ? formatDateTime : (v) => v || ""
const safeMoney = typeof money === 'function' ? money : (v) => String(v || "0.00")
const safeSum = typeof sum === 'function' ? sum : (arr, fn) => (arr || []).reduce((acc, item) => acc + (Number(fn(item)) || 0), 0)

function decorateOrder(order) {
  if (!order) return {}
  const status = order.status || ""
  const next = NEXT_ACTION[status] || {}
  return Object.assign({}, order, {
    _statusText: STATUS_TEXT[status] || status || "未知状态",
    _tone: STATUS_TONE[status] || "neutral",
    _nextStatus: next.status || "",
    _nextText: next.text || "",
    _diningText: order.dining_type === "takeaway" ? "打包" : "堂食",
    _createdAt: safeFormatDateTime(order.created_at),
    _amount: safeMoney(order.total_amount)
  })
}

Page({
  data: {
    session: {},
    stall: {},
    date: "",
    loading: true,
    error: "",
    stats: { total: 0, pending: 0, preparing: 0, ready: 0, completed: 0, revenue: "0.00" },
    recentOrders: []
  },

  onLoad() {
    this._knownPendingIds = null
    this.updateSessionAndDate()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }

    const hasSession = this.updateSessionAndDate()
    if (hasSession) {
      this.refresh(false)
      this.startPolling()
    } else {
      this.stopPolling()
      this.setData({
        loading: false,
        error: "未获取到登录信息，请先登录"
      })
    }
  },

  onHide() {
    this.stopPolling()
  },

  onUnload() {
    this.stopPolling()
  },

  updateSessionAndDate() {
    const app = getApp()
    const session = (app && typeof app.requireSession === 'function') ? app.requireSession() : null
    const dateStr = safeFormatDate()

    if (session) {
      this.setData({ session, date: dateStr })
      return true
    } else {
      this.setData({ date: dateStr })
      return false
    }
  },

  startPolling() {
    this.stopPolling()
    const interval = (env && typeof env.orderPollingMs === 'number' && env.orderPollingMs > 0)
      ? env.orderPollingMs
      : 5000
    this._timer = setInterval(() => this.refresh(true), interval)
  },

  stopPolling() {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  },

  async refresh(silent = false) {
    if (typeof silent !== 'boolean') {
      silent = false
    }

    if (this._refreshing) {
      wx.stopPullDownRefresh()
      return
    }

    const session = this.data.session || {}
    const stallId = session.stallId

    if (!stallId) {
      if (!silent) {
        this.setData({
          loading: false,
          error: "未绑定有效档口信息"
        })
      }
      wx.stopPullDownRefresh()
      return
    }

    this._refreshing = true
    if (!silent) {
      this.setData({ loading: true, error: "" })
    }

    try {
      const res = await Promise.all([
        merchantService.getStall(stallId),
        orderService.listOrders(stallId, { date: safeFormatDate() })
      ])
      const stall = res[0]
      const orders = res[1]

      const rawList = Array.isArray(orders) ? orders : []
      const list = rawList.map(decorateOrder)
      const pendingIds = list.filter(item => item.status === "pending").map(item => item.id)

      if (this._knownPendingIds && pendingIds.some(id => !this._knownPendingIds.includes(id))) {
        try {
          const preferences = (storage && typeof storage.getPreferences === 'function')
            ? storage.getPreferences()
            : {}
          if (preferences && preferences.vibrateOnNewOrder && typeof wx.vibrateShort === 'function') {
            wx.vibrateShort({ type: "medium" })
          }
        } catch (e) {
          console.warn("播放新订单提醒失败:", e)
        }
        wx.showToast({ title: "收到新订单", icon: "none" })
      }
      this._knownPendingIds = pendingIds

      const completed = list.filter(item => item.status === "completed")
      const activeStatuses = Array.isArray(ACTIVE_STATUSES) ? ACTIVE_STATUSES : ["accepted", "preparing", "ready", "pending"]

      this.setData({
        stall: stall || {},
        stats: {
          total: list.length,
          pending: pendingIds.length,
          preparing: list.filter(item => item.status === "accepted" || item.status === "preparing").length,
          ready: list.filter(item => item.status === "ready").length,
          completed: completed.length,
          revenue: safeMoney(safeSum(completed, item => item.total_amount))
        },
        recentOrders: list.filter(item => activeStatuses.includes(item.status)).slice(0, 3),
        error: ""
      })
    } catch (error) {
      if (!silent) {
        this.setData({
          error: (error && error.message) ? error.message : "数据同步失败，点击重试"
        })
      }
    } finally {
      this._refreshing = false
      if (!silent) {
        this.setData({ loading: false })
      }
      wx.stopPullDownRefresh()
    }
  },

  onRetry() {
    this.refresh(false)
  },

  onPullDownRefresh() {
    this.refresh(false)
  },

  openOrders(event) {
    const status = (event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.status) || "active"
    wx.setStorageSync("merchant_order_filter_once", status)
    wx.switchTab({ url: "/pages/orders/orders" })
  },

  openMenu() {
    wx.switchTab({ url: "/pages/menu/menu" })
  },

  openDetail(event) {
    const id = event && event.detail && event.detail.id
    if (id) {
      wx.navigateTo({ url: `/pages/order-detail/order-detail?id=${id}` })
    }
  }
})