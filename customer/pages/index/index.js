const app = getApp()

Page({
  data: { canteens: [], loading: true },

  onLoad() { this.loadCanteens() },
  onPullDownRefresh() { this.loadCanteens().finally(wx.stopPullDownRefresh) },

  async loadCanteens() {
    try {
      this.setData({ loading: true, canteens: await app.request("/api/canteens") })
    } catch (e) {
      wx.showToast({ title: e.message || "后端未启动", icon: "none" })
    } finally {
      this.setData({ loading: false })
    }
  },

  chooseCanteen(e) {
    const { id, name } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/stalls/stalls?id=${id}&name=${encodeURIComponent(name)}` })
  },

  openMerchant() { wx.navigateTo({ url: "/api/pages/merchant/orders/orders?stallId=1" }) }
})

