function pad(value) {
  return String(value).padStart(2, "0")
}

function formatDate(input) {
  const date = input ? new Date(input) : new Date()
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function formatDateTime(value) {
  if (!value) return "--"
  let date = new Date(value)
  if (Number.isNaN(date.getTime()) && typeof value === "string") {
    date = new Date(value.replace(/-/g, "/").replace("T", " "))
  }
  if (Number.isNaN(date.getTime())) return String(value)
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function money(value) {
  const number = Number(value || 0)
  return Number.isFinite(number) ? number.toFixed(2) : "0.00"
}

function sum(items, getter) {
  return (items || []).reduce((total, item) => total + Number(getter(item) || 0), 0)
}

module.exports = { formatDate, formatDateTime, money, sum }
