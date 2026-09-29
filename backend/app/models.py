from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, JSON, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Canteen(Base):
    __tablename__ = "canteens"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    location: Mapped[str] = mapped_column(String(160), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    stalls: Mapped[list[Stall]] = relationship(back_populates="canteen")


class Stall(Base):
    __tablename__ = "stalls"

    id: Mapped[int] = mapped_column(primary_key=True)
    canteen_id: Mapped[int] = mapped_column(ForeignKey("canteens.id"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    floor: Mapped[str] = mapped_column(String(30), default="1F")
    pickup_prefix: Mapped[str] = mapped_column(String(4), unique=True)
    notice: Mapped[str] = mapped_column(String(200), default="")
    is_open: Mapped[bool] = mapped_column(Boolean, default=True)

    canteen: Mapped[Canteen] = relationship(back_populates="stalls")
    dishes: Mapped[list[Dish]] = relationship(back_populates="stall")
    daily_menus: Mapped[list[DailyMenu]] = relationship(back_populates="stall")
    orders: Mapped[list[Order]] = relationship(back_populates="stall")


class Dish(Base):
    __tablename__ = "dishes"

    id: Mapped[int] = mapped_column(primary_key=True)
    stall_id: Mapped[int] = mapped_column(ForeignKey("stalls.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(String(300), default="")
    image_url: Mapped[str] = mapped_column(String(500), default="")
    default_price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # ------------------ 【新增字段】能量与营养成分 ------------------
    energy_kcal: Mapped[int | None] = mapped_column(Integer, default=0, nullable=True)
    nutrition: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # -----------------------------------------------------------------

    # Fix: 这里的 back_populates 指向 Stall 类的 dishes 属性
    stall: Mapped[Stall] = relationship(back_populates="dishes")
    menu_entries: Mapped[list[DailyMenu]] = relationship(back_populates="dish")


class DailyMenu(Base):
    __tablename__ = "daily_menus"
    __table_args__ = (UniqueConstraint("dish_id", "service_date", "meal_period"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    stall_id: Mapped[int] = mapped_column(ForeignKey("stalls.id"), index=True)
    dish_id: Mapped[int] = mapped_column(ForeignKey("dishes.id"), index=True)
    service_date: Mapped[date] = mapped_column(Date, index=True)
    meal_period: Mapped[str] = mapped_column(String(20), index=True)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    stock: Mapped[int] = mapped_column(Integer)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)

    stall: Mapped[Stall] = relationship(back_populates="daily_menus")
    dish: Mapped[Dish] = relationship(back_populates="menu_entries")


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    stall_id: Mapped[int] = mapped_column(ForeignKey("stalls.id"), index=True)
    customer_name: Mapped[str] = mapped_column(String(60))
    customer_no: Mapped[str] = mapped_column(String(60), index=True)
    pickup_code: Mapped[str | None] = mapped_column(String(20), unique=True, index=True)
    dining_type: Mapped[str] = mapped_column(String(20))
    service_date: Mapped[date] = mapped_column(Date, index=True)
    meal_period: Mapped[str] = mapped_column(String(20), index=True)
    requested_pickup_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)

    stall: Mapped[Stall] = relationship(back_populates="orders")
    items: Mapped[list[OrderItem]] = relationship(back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    daily_menu_id: Mapped[int] = mapped_column(ForeignKey("daily_menus.id"))
    dish_name: Mapped[str] = mapped_column(String(100))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    quantity: Mapped[int] = mapped_column(Integer)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2))

    order: Mapped[Order] = relationship(back_populates="items")


# =====================================================================
# 顾客长期记忆与个人档案模型 (最小新增改动)
# =====================================================================

class CustomerProfile(Base):
    """顾客长期记忆档案表，持久化存储 LLM 提炼出的用户个人偏好与体征数据"""
    __tablename__ = "customer_profiles"

    customer_no: Mapped[str] = mapped_column(String(60), primary_key=True)
    
    # 结构化记忆字段（存储字典结构：包含 basic_info, dietary_restrictions, flavor_preferences, custom_notes 等）
    preferences: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=dict)
    
    # 自然语言文本摘要，方便直接拼接注入 System Prompt
    memory_summary: Mapped[str | None] = mapped_column(Text, nullable=True, default="")
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)
