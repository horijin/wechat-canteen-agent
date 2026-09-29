const authService = require("../../services/auth")
const merchantService = require("../../services/merchant")
const env = require("../../config/env")
const { getApiBaseUrl, saveApiBaseUrl } = require("../../utils/storage")

Page({
  data: {
    loading: true,
    entering: false,
    canteens: [],
    canteenIndex: 0,
    stalls: [],
    selectedStallId: 0,
    showServer: false,
    apiBaseUrl: "",
    error: ""
  },

  onLoad() {
    const session = getApp().getSession()
    if (session && session.stallId) {
      wx.reLaunch({ url: "/pages/dashboard/dashboard" })
      return
    }
    this.setData({ apiBaseUrl: getApiBaseUrl() || env.defaultApiBaseUrl })
    this.loadCanteens()
  },

  async loadCanteens() {
    this.setData({ loading: true, error: "" })
    try {
      const canteens = await authService.listCanteens()
      this.setData({ canteens: canteens || [], canteenIndex: 0 })
      if (canteens && canteens.length) await this.loadStalls(canteens[0].id)
      else this.setData({ stalls: [] })
    } catch (error) {
      this.setData({ error: error.message })
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadStalls(canteenId) {
    const stalls = await authService.listStalls(canteenId)
    const first = stalls && stalls[0]
    this.setData({ stalls: stalls || [], selectedStallId: first ? first.id : 0 })
  },

  async chooseCanteen(event) {
    const canteenIndex = Number(event.detail.value)
    const canteen = this.data.canteens[canteenIndex]
    this.setData({ canteenIndex, loading: true, error: "" })
    try {
      await this.loadStalls(canteen.id)
    } catch (error) {
      this.setData({ error: error.message, stalls: [] })
    } finally {
      this.setData({ loading: false })
    }
  },

  chooseStall(event) {
    this.setData({ selectedStallId: Number(event.currentTarget.dataset.id) })
  },

// login.js
async enter() {
  if (this.data.entering) return
  const canteen = this.data.canteens[this.data.canteenIndex]
  const stall = this.data.stalls.find(item => item.id === this.data.selectedStallId)
  if (!canteen || !stall) {
    wx.showToast({ title: "请选择经营档口", icon: "none" })
    return
  }
  this.setData({ entering: true })
  try {
    const res = await authService.loginOrEnterStall({ canteenId: canteen.id, stallId: stall.id })
    
    const session = {
      canteen,
      stall,
      stallId: stall.id,
      accessToken: res.access_token || res.token 
    }
    
    authService.saveSession(session)
    getApp().globalData.merchantSession = session
    wx.reLaunch({ url: "/pages/dashboard/dashboard" })
  } catch (error) {
    wx.showToast({ title: error.message || "登录授权失败", icon: "none" })
  } finally {
    this.setData({ entering: false })
  }
},

  toggleServer() {
    this.setData({ showServer: !this.data.showServer })
  },

  inputApiBase(event) {
    this.setData({ apiBaseUrl: event.detail.value })
  },

  saveServer() {
    const value = this.data.apiBaseUrl.trim().replace(/\/+$/, "")
    if (!/^https?:\/\//.test(value)) {
      wx.showToast({ title: "请输入 http:// 或 https:// 地址", icon: "none" })
      return
    }
    saveApiBaseUrl(value)
    wx.showToast({ title: "已保存" })
    this.setData({ showServer: false })
    this.loadCanteens()
  }
})
