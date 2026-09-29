const app = getApp()

Page({
  data: { order: null, customerName: "", customerNo: "", diningType: "takeaway", pickupTime: "11:45", note: "", submitting: false },
  onLoad() {
    const order = wx.getStorageSync("checkout")
    if (!order || !order.items) { wx.navigateBack(); return }
    const profile = wx.getStorageSync("customerProfile") || {}
    this.setData({ order, customerName: profile.customerName || "", customerNo: profile.customerNo || "" })
  },
  inputField(e) { this.setData({ [e.currentTarget.dataset.field]: e.detail.value }) },
  chooseDining(e) { this.setData({ diningType: e.currentTarget.dataset.type }) },
  chooseTime(e) { this.setData({ pickupTime: e.detail.value }) },
  async submit() {
    if (!this.data.customerName.trim() || !this.data.customerNo.trim()) {
      wx.showToast({ title: "请填写姓名和学工号", icon: "none" }); return
    }
    this.setData({ submitting: true })
    try {
      const result = await app.request("/api/orders", {
        method: "POST",
        data: {
          customer_name: this.data.customerName.trim(), customer_no: this.data.customerNo.trim(),
          dining_type: this.data.diningType, requested_pickup_time: this.data.pickupTime,
          note: this.data.note,
          items: this.data.order.items.map((x) => ({ daily_menu_id: x.daily_menu_id, quantity: x.quantity }))
        }
      })
      wx.setStorageSync("customerProfile", { customerName: this.data.customerName, customerNo: this.data.customerNo })
      wx.removeStorageSync("checkout")
      wx.redirectTo({ url: `/api/pages/order/order?id=${result.id}` })
    } catch (e) { wx.showToast({ title: e.message, icon: "none" }) }
    finally { this.setData({ submitting: false }) }
  }
})

