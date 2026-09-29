const SESSION_KEY = "merchant_session_v1"
const API_BASE_KEY = "merchant_api_base_v1"
const PREFS_KEY = "merchant_preferences_v1"
const DEFAULT_TOKEN = "canteen-merchant-secret-key" // 后端默认 Token

function getSession() {
  return wx.getStorageSync(SESSION_KEY) || null
}

// 供 request.js 调用的 Token 获取函数
function getMerchantToken() {
  const session = getSession()
  if (session && session.token) {
    return session.token
  }
  return DEFAULT_TOKEN
}

function saveSession(session) {
  wx.setStorageSync(SESSION_KEY, session)
  return session
}

function clearSession() {
  wx.removeStorageSync(SESSION_KEY)
}

function getApiBaseUrl() {
  return wx.getStorageSync(API_BASE_KEY) || ""
}

function saveApiBaseUrl(value) {
  wx.setStorageSync(API_BASE_KEY, String(value || "").replace(/\/+$/, ""))
}

function getPreferences() {
  return Object.assign({ vibrateOnNewOrder: true }, wx.getStorageSync(PREFS_KEY) || {})
}

function savePreferences(value) {
  wx.setStorageSync(PREFS_KEY, value)
}

module.exports = {
  getSession,
  getMerchantToken, // 导出新函数
  saveSession,
  clearSession,
  getApiBaseUrl,
  saveApiBaseUrl,
  getPreferences,
  savePreferences
}
