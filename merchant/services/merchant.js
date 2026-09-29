const { request } = require("../utils/request")

function getStall(stallId) {
  return request(`/api/stalls/${stallId}`)
}

function health() {
  return request("/health", { timeout: 6000 })
}

module.exports = { getStall, health }
