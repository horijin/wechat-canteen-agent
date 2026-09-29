const env = require("../config/env")
const { getApiBaseUrl, getSession, getMerchantToken } = require("./storage")

/**
 * 动态获取当前使用的 API 基础路径
 */
function apiBaseUrl() {
  return (getApiBaseUrl() || env.defaultApiBaseUrl).replace(/\/+$/, "")
}

/**
 * 统一解析后端返回的错误信息
 */
function normalizeError(res) {
  const data = res && res.data
  if (data && typeof data.detail === "string") return data.detail
  if (data && Array.isArray(data.detail)) {
    return data.detail.map(item => item.msg || "参数错误").join("；")
  }
  if (data && data.message) return data.message
  if (res && res.statusCode === 401) return "商家密钥无效或鉴权失败，请检查密钥配置"
  if (res && res.statusCode === 403) return "没有操作该档口的权限"
  if (res && res.statusCode === 404) return "请求的资源不存在"
  if (res && res.statusCode === 409) return "数据状态已变化，请刷新后重试"
  return `服务请求失败${res && res.statusCode ? `（${res.statusCode}）` : ""}`
}

/**
 * 获取当前鉴权需要的 Token 字符串
 */
function resolveToken() {
  // 1. 优先使用 storage.js 导出的 getMerchantToken
  if (typeof getMerchantToken === "function") {
    const token = getMerchantToken()
    if (token) return token
  }
  
  // 2. 从当前 Session 中提取 token 或 accessToken
  const session = getSession()
  if (session) {
    if (session.token) return session.token
    if (session.accessToken) return session.accessToken
  }
  
  // 3. 兜底使用 env 配置或默认静态 Token（强保证返回字符串，绝不返回 undefined）
  return (env && env.defaultMerchantToken) || "canteen-merchant-secret-key"
}

/**
 * 封装通用网络请求函数
 */
function request(path, options = {}) {
  const token = resolveToken() // 必须先获取 token
  console.log("当前发送的 Token 为:", token) // 获取后再打印

  const headers = Object.assign(
    { 
      "content-type": "application/json",
      "X-Merchant-Token": token // 自动携带商家鉴权 Header
    }, 
    options.header || {}
  )

  return new Promise((resolve, reject) => {
    wx.request({
      url: /^https?:\/\//.test(path) ? path : `${apiBaseUrl()}${path}`,
      method: options.method || "GET",
      data: options.data,
      header: headers,
      timeout: options.timeout || (env && env.requestTimeout) || 10000,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
          return
        }
        const error = new Error(normalizeError(res))
        error.statusCode = res.statusCode
        error.response = res.data
        reject(error)
      },
      fail(err) {
        const message = err && err.errMsg && err.errMsg.includes("timeout")
          ? "连接服务超时，请检查网络与 API 地址"
          : "无法连接服务，请检查网络与 API 地址"
        const error = new Error(message)
        error.cause = err
        reject(error)
      },
      complete: options.complete
    })
  })
}

/**
 * 封装文件上传函数（如菜品图片上传）
 */
function upload(path, filePath, name = "file", extraFormData = {}) {
  const token = resolveToken()
  const header = {
    "X-Merchant-Token": token // 上传文件接口同样自动注入鉴权 Header
  }

  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${apiBaseUrl()}${path}`,
      filePath,
      name,
      formData: extraFormData,
      header,
      timeout: 30000,
      success(res) {
        let data = res.data
        try { 
          data = JSON.parse(res.data) 
        } catch (_) {}

        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data)
        } else {
          const errMsg = normalizeError({ statusCode: res.statusCode, data })
          reject(new Error(errMsg || "上传失败"))
        }
      },
      fail(err) { 
        reject(new Error("上传失败，请检查网络与网络权限")) 
      }
    })
  })
}

/**
 * 将相对图片路径转为绝对网络 URL
 */
function absoluteAssetUrl(value) {
  if (!value || /^https?:\/\//.test(value)) return value || ""
  return `${apiBaseUrl()}${value.startsWith("/") ? value : `/${value}`}`
}

module.exports = { 
  request, 
  upload, 
  apiBaseUrl, 
  absoluteAssetUrl 
}