const { request } = require("../utils/request")

function queryString(params) {
  const pairs = Object.keys(params || {})
    .filter(key => params[key] !== "" && params[key] !== null && params[key] !== undefined)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
  return pairs.length ? `?${pairs.join("&")}` : ""
}

function listOrders(stallId, params = {}) {
  return request(`/api/merchant/stalls/${stallId}/orders${queryString(params)}`)
}

function getOrder(orderId) {
  return request(`/api/orders/${orderId}`)
}

function updateOrderStatus(orderId, status) {
  return request(`/api/merchant/orders/${orderId}/status`, {
    method: "PATCH",
    data: { status }
  })
}

module.exports = { listOrders, getOrder, updateOrderStatus }
