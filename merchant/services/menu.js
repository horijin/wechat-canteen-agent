const { request, upload } = require("../utils/request")

function listDishes(stallId) {
  return request(`/api/stalls/${stallId}/dishes`)
}

function getMenu(stallId, date, mealPeriod) {
  return request(`/api/stalls/${stallId}/menu?date=${encodeURIComponent(date)}&meal_period=${encodeURIComponent(mealPeriod)}`)
}

function publishMenu(stallId, payload) {
  return request(`/api/merchant/stalls/${stallId}/daily-menus`, {
    method: "POST",
    data: payload
  })
}

function updateMenuItem(menuId, payload) {
  return request(`/api/merchant/menu-items/${menuId}`, {
    method: "PATCH",
    data: payload
  })
}

function uploadDishImage(filePath) {
  return upload("/api/merchant/upload-dish-image", filePath)
}
function deleteMenuItem(menuId) {
  return request(`/api/merchant/menu-items/${menuId}`, {
    method: "DELETE"
  })
}

module.exports = { listDishes, getMenu, publishMenu, updateMenuItem, uploadDishImage, deleteMenuItem }
