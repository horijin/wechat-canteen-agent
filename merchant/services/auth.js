const { request } = require("../utils/request")
const { saveSession } = require("../utils/storage")

/**
 * 获取食堂列表
 */
function listCanteens() {
  return request("/api/canteens")
}

/**
 * 获取指定食堂下的档口列表
 */
function listStalls(canteenId) {
  return request(`/api/canteens/${canteenId}/stalls`)
}

/**
 * 选择档口并保存上下文 Session
 */
async function loginOrEnterStall({ canteen, stall, canteenId, stallId, token }) {
  const tokenValue = token || "canteen-merchant-secret-key"
  
  const session = {
    canteenId: (canteen && canteen.id) || canteenId,
    stallId: (stall && stall.id) || stallId,
    canteenName: canteen ? canteen.name : "",
    stallName: stall ? stall.name : "",
    canteen: canteen || null,
    stall: stall || null,
    token: tokenValue,
    accessToken: tokenValue
  }
  
  // 使用 storage.js 的 saveSession 统一保存
  saveSession(session)
  return session
}

/**
 * 旧版/同步选择档口并保存 Session 函数
 */
function enterStall(canteen, stall, token) {
  const tokenValue = token || "canteen-merchant-secret-key"
  const session = {
    canteenId: canteen ? canteen.id : null,
    stallId: stall ? stall.id : null,
    canteenName: canteen ? canteen.name : "",
    stallName: stall ? stall.name : "",
    canteen: canteen || null,
    stall: stall || null,
    token: tokenValue,
    accessToken: tokenValue
  }
  
  saveSession(session)
  return session
}

module.exports = { 
  listCanteens, 
  listStalls, 
  loginOrEnterStall, 
  enterStall,
  saveSession
}
