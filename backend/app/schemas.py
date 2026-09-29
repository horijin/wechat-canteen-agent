from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# ==================== 通用枚举类型 ====================

MealPeriod = Literal["breakfast", "lunch", "dinner"]
DiningType = Literal["dine_in", "takeaway"]
OrderStatus = Literal["pending", "accepted", "preparing", "ready", "completed", "cancelled"]


# ==================== 基础响应模型 ====================

class CanteenOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    location: str


class StallOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    canteen_id: int
    name: str
    floor: str
    pickup_prefix: str
    notice: str
    is_open: bool


class DishOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    stall_id: int
    name: str
    description: str
    image_url: str
    default_price: Decimal
    is_active: bool
    # ------------------ 能量与营养成分 ------------------
    energy_kcal: int | None = None  
    nutrition: dict[str, Any] | None = None


class MenuOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    stall_id: int
    dish_id: int
    service_date: date
    meal_period: str
    price: Decimal
    stock: int
    is_available: bool
    dish: DishOut


# ==================== 订单相关模型 ====================

class OrderItemCreate(BaseModel):
    daily_menu_id: int
    quantity: int = Field(ge=1, le=20)


class OrderCreate(BaseModel):
    customer_name: str = Field(min_length=1, max_length=50)
    customer_no: str = Field(min_length=1, max_length=50)
    dining_type: DiningType
    requested_pickup_time: str | None = None
    note: str = ""
    items: list[OrderItemCreate] = Field(min_length=1)

    @field_validator("requested_pickup_time")
    @classmethod
    def validate_pickup_time(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        parts = value.split(":")
        if len(parts) != 2 or not all(part.isdigit() for part in parts):
            raise ValueError("取餐时间格式应为 HH:MM")
        hour, minute = map(int, parts)
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            raise ValueError("取餐时间无效")
        return value


class OrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    daily_menu_id: int
    dish_name: str
    unit_price: Decimal
    quantity: int
    subtotal: Decimal


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    stall_id: int
    customer_name: str
    customer_no: str
    pickup_code: str
    dining_type: str
    service_date: date
    meal_period: str
    requested_pickup_time: str | None
    status: str
    total_amount: Decimal
    note: str
    created_at: datetime
    updated_at: datetime
    items: list[OrderItemOut]


class StatusUpdate(BaseModel):
    status: OrderStatus


# ==================== 菜单管理模型 ====================

class DailyMenuItemUpsert(BaseModel):
    dish_id: int
    price: Decimal = Field(gt=0, decimal_places=2)
    stock: int = Field(ge=0, le=9999)
    is_available: bool = True


class DailyMenuPublish(BaseModel):
    service_date: date
    meal_period: MealPeriod
    items: list[DailyMenuItemUpsert]


class MenuStockUpdate(BaseModel):
    price: Decimal | None = Field(default=None, gt=0, decimal_places=2)
    stock: int | None = Field(default=None, ge=0, le=9999)
    is_available: bool | None = None


# ==================== AI 智能体与顾客档案模型 ====================

class NutritionInfo(BaseModel):
    """营养详情细化模型，增加空数据拦截器"""
    calories: int | None = None
    protein: float | None = None
    fat: float | None = None
    carbs: float | None = None

    @model_validator(mode="after")
    def check_not_all_none(self) -> "NutritionInfo":
        """强校验：如果四大指标全部为 None，直接抛出 ValueError 阻止该空对象实例化"""
        if all(
            v is None
            for v in [self.calories, self.protein, self.fat, self.carbs]
        ):
            raise ValueError("NutritionInfo 不能所有字段都为 None")
        return self


class AIDishOut(BaseModel):
    """AI 推荐返回给前端的菜品数据模型"""
    model_config = ConfigDict(from_attributes=True)
    id: int
    daily_menu_id: int
    name: str
    price: float
    stall_id: int
    stall_name: str = ""
    energy_kcal: int | None = None
    nutrition: NutritionInfo | None = None  # 收紧类型，避免 dict 混入规避校验


class ChatMessage(BaseModel):
    """单条历史对话模型"""
    role: Literal["user", "assistant"] = Field(..., description="发言角色: user 或 assistant")
    content: str = Field(..., description="对话文本内容")


# ------------------ 【最小新增】顾客记忆档案模型 ------------------

class CustomerProfileBase(BaseModel):
    preferences: dict[str, Any] | None = Field(default_factory=dict, description="结构化偏好（体征、忌口、口味等）")
    memory_summary: str | None = Field(default="", description="自然语言记忆摘要，供 Prompt 使用")


class CustomerProfileUpdate(CustomerProfileBase):
    pass


class CustomerProfileOut(CustomerProfileBase):
    model_config = ConfigDict(from_attributes=True)
    customer_no: str
    created_at: datetime
    updated_at: datetime

# ------------------------------------------------------------------


class AIChatRequest(BaseModel):
    message: str = Field(..., description="用户输入的聊天/选菜需求")
    customer_no: str | None = Field(default=None, description="用户学号/身份标识，用于匹配历史消费记录及长期记忆")
    cart: dict[str, Any] | None = Field(default_factory=dict, description="当前用户的购物车上下文")
    history: list[ChatMessage] | None = Field(
        default_factory=list, 
        description="过往会话历史记录，后端会自动切片截断以控制 token 开销"
    )
    # 可选：前端设置界面主动更新的用户偏好概览
    user_profile: dict[str, Any] | None = Field(default=None, description="可选项：前端主动传递的用户偏好微调")


class AIChatResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    reply: str = Field(..., description="AI 对话回复文本")
    dishes: list[AIDishOut] | None = Field(
        default=None, 
        description="推荐菜品列表，支持单件菜品或多菜品组合套餐"
    )

    @property
    def dish(self) -> AIDishOut | None:
        """兼容旧前端读取单数的属性（自动获取推荐列表的第一项）"""
        if self.dishes and len(self.dishes) > 0:
            return self.dishes[0]
        return None