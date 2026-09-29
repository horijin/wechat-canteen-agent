const orderService = require("../../services/orders")
const { STATUS_TEXT, STATUS_TONE, NEXT_ACTION } = require("../../utils/constants")
const { formatDateTime, money } = require("../../utils/format")

const FLOW = [
  { key: "pending", text: "等待商家接单" },
  { key: "accepted", text: "商家已接单" },
  { key: "preparing", text: "菜品制作中" },
  { key: "ready", text: "等待顾客取餐" },
  { key: "completed", text: "订单已完成" }
]

function decorate(order) {
  const next = NEXT_ACTION[order.status] || {}
  const currentIndex = FLOW.findIndex(item => item.key === order.status)
  const timeline = order.status === "cancelled"
    ? [{ key: "cancelled", text: "订单已取消", state: "current" }]
    : FLOW.map((item, index) => Object.assign({}, item, {
        state: index < currentIndex ? "done" : (index === currentIndex ? "current" : "future")
      }))
  return Object.assign({}, order, {
    _statusText: STATUS_TEXT[order.status] || order.status,
    _tone: STATUS_TONE[order.status] || "neutral",
    _nextStatus: next.status || "",
    _nextText: next.text || "",
    _createdAt: formatDateTime(order.created_at),
    _amount: money(order.total_amount),
    _diningText: order.dining_type === "takeaway" ? "打包" : "堂食",
    _timeline: timeline
  })
}

Page({
  data: { orderId: 0, order: {}, loading: true, busy: false, error: "" },

  onLoad(options) {
    const orderId = Number(options.id)
    if (!orderId) {
      this.setData({ loading: false, error: "订单编号无效" })
      return
    }
    this.setData({ orderId })
    this.loadOrder()
  },

  async loadOrder() {
    this.setData({ loading: true, error: "" })
    try {
      const order = await orderService.getOrder(this.data.orderId)
      const session = getApp().requireSession()
      if (!session) return
      if (Number(order.stall_id) !== Number(session.stallId)) {
        throw new Error("该订单不属于当前档口")
      }
      this.setData({ order: decorate(order) })
    } catch (error) {
      this.setData({ error: error.message })
    } finally {
      this.setData({ loading: false })
    }
  },

  async advance() {
    const order = this.data.order
    if (!order._nextStatus || this.data.busy) return
    this.setData({ busy: true })
    try {
      const updated = await orderService.updateOrderStatus(order.id, order._nextStatus)
      this.setData({ order: decorate(updated) })
      wx.showToast({ title: "状态已更新" })
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" })
      await this.loadOrder()
    } finally {
      this.setData({ busy: false })
    }
  },

  cancel() {
    wx.showModal({
      title: "取消订单",
      content: "订单取消后不能恢复，确定继续吗？",
      confirmColor: "#c8422e",
      success: async result => {
        if (!result.confirm || this.data.busy) return
        this.setData({ busy: true })
        try {
          const updated = await orderService.updateOrderStatus(this.data.order.id, "cancelled")
          this.setData({ order: decorate(updated) })
        } catch (error) {
          wx.showToast({ title: error.message, icon: "none" })
          await this.loadOrder()
        } finally {
          this.setData({ busy: false })
        }
      }
    })
  }
})
