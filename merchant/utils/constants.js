const STATUS_TEXT = {
  pending: "待接单",
  accepted: "已接单",
  preparing: "制作中",
  ready: "待取餐",
  completed: "已完成",
  cancelled: "已取消"
}

const STATUS_TONE = {
  pending: "warning",
  accepted: "info",
  preparing: "primary",
  ready: "success",
  completed: "neutral",
  cancelled: "danger"
}

const NEXT_ACTION = {
  pending: { status: "accepted", text: "接单" },
  accepted: { status: "preparing", text: "开始制作" },
  preparing: { status: "ready", text: "制作完成" },
  ready: { status: "completed", text: "确认取餐" }
}

const MEAL_PERIODS = [
  { key: "breakfast", name: "早餐" },
  { key: "lunch", name: "午餐" },
  { key: "dinner", name: "晚餐" }
]

const ORDER_FILTERS = [
  { key: "active", name: "进行中" },
  { key: "pending", name: "待接单" },
  { key: "preparing", name: "制作中" },
  { key: "ready", name: "待取餐" },
  { key: "completed", name: "已完成" },
  { key: "cancelled", name: "已取消" },
  { key: "all", name: "全部" }
]

module.exports = {
  STATUS_TEXT,
  STATUS_TONE,
  NEXT_ACTION,
  MEAL_PERIODS,
  ORDER_FILTERS,
  ACTIVE_STATUSES: ["pending", "accepted", "preparing", "ready"]
}
