const { getSession, clearSession } = require("./utils/storage")
const { request } = require("./utils/request")

App({
  globalData: {
    merchantSession: null
  },

  onLaunch() {
    this.globalData.merchantSession = getSession()
  },

  getSession() {
    const session = getSession()
    this.globalData.merchantSession = session
    return session
  },

  requireSession() {
    const session = this.getSession()
    if (!session || !session.stallId) {
      wx.reLaunch({ url: "/pages/login/login" })
      return null
    }
    return session
  },

  logout() {
    clearSession()
    this.globalData.merchantSession = null
    wx.reLaunch({ url: "/pages/login/login" })
  },


  request(path, options) {
    return request(path, options)
  }
})
