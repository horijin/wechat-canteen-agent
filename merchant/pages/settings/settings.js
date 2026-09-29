const merchantService = require("../../services/merchant")
const env = require("../../config/env")
const {
  getApiBaseUrl,
  saveApiBaseUrl,
  getPreferences,
  savePreferences
} = require("../../utils/storage")

Page({
  data: {
    session: {},
    stall: {},
    avatarText: "商",
    apiBaseUrl: "",
    preferences: { vibrateOnNewOrder: true },
    testing: false,
    serviceState: "unknown",
    serviceText: "未检测"
  },

  onShow() {
    const session = getApp().requireSession()
    if (!session) return
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 })
    }
    this.setData({
      session,
      avatarText: String(session.stallName || "商").slice(0, 1),
      apiBaseUrl: getApiBaseUrl() || env.defaultApiBaseUrl,
      preferences: getPreferences()
    })
    this.loadStall()
  },

  async loadStall() {
    try {
      const stall = await merchantService.getStall(this.data.session.stallId)
      this.setData({ stall, avatarText: String(stall.name || this.data.session.stallName || "商").slice(0, 1) })
    } catch (_) {}
  },

  inputApiBase(event) {
    this.setData({ apiBaseUrl: event.detail.value })
  },

  saveServer() {
    const value = this.data.apiBaseUrl.trim().replace(/\/+$/, "")
    if (!/^https?:\/\//.test(value)) {
      wx.showToast({ title: "请输入完整的 http(s) 地址", icon: "none" })
      return false
    }
    saveApiBaseUrl(value)
    this.setData({ apiBaseUrl: value, serviceState: "unknown", serviceText: "配置已更新" })
    wx.showToast({ title: "配置已保存" })
    return true
  },

  async testServer() {
    if (this.data.testing || !this.saveServer()) return
    this.setData({ testing: true, serviceState: "testing", serviceText: "检测中" })
    const started = Date.now()
    try {
      const response = await merchantService.health()
      if (!response || response.status !== "ok") throw new Error("健康检查返回异常")
      this.setData({ serviceState: "online", serviceText: `连接正常 · ${Date.now() - started}ms` })
    } catch (error) {
      this.setData({ serviceState: "offline", serviceText: error.message })
    } finally {
      this.setData({ testing: false })
    }
  },

  toggleVibration(event) {
    const preferences = Object.assign({}, this.data.preferences, { vibrateOnNewOrder: event.detail.value })
    savePreferences(preferences)
    this.setData({ preferences })
  },

  changeStall() {
    wx.showModal({
      title: "切换经营档口",
      content: "将退出当前档口并返回选择页。",
      success: result => { if (result.confirm) getApp().logout() }
    })
  },

  showProductionTip() {
    wx.showModal({
      title: "生产环境必做",
      content: "当前后端商家接口没有鉴权。上线前必须接入微信登录、商家账号与档口归属校验，并配置 HTTPS request 合法域名。",
      showCancel: false
    })
  }
})
