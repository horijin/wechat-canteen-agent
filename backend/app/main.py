import json
import os
import re
import shutil
import uuid
from contextlib import asynccontextmanager
from datetime import date
from decimal import Decimal
from pathlib import Path

import httpx
from fastapi import Depends, FastAPI, File, HTTPException, Header, Query, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from .database import Base, SessionLocal, engine, get_db
from .models import Canteen, CustomerProfile, DailyMenu, Dish, Order, OrderItem, Stall
from .schemas import (
    AIChatRequest,
    AIChatResponse,
    AIDishOut,
    CanteenOut,
    CustomerProfileOut,
    DailyMenuPublish,
    DishOut,
    MenuOut,
    MenuStockUpdate,
    NutritionInfo,
    OrderCreate,
    OrderOut,
    StallOut,
    StatusUpdate,
)
from .seed import seed_database

# 配置文件上传及静态文件路径
UPLOAD_DIR = Path("static/dishes")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(_: FastAPI):
    # 建立表结构
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        try:
            # 简单检查如果库里没数据才 seed，避免每次 reload 都阻塞
            if db.scalar(select(Canteen)) is None:
                seed_database(db)
        except Exception as e:
            print(f"[Database Seed] Warning or Error: {e}")
    yield


app = FastAPI(
    title="学校食堂订餐 API",
    version="0.5.0",
    lifespan=lifespan,
    redirect_slashes=False,
)

app.mount("/static", StaticFiles(directory="static"), name="static")

# 针对微信真机完全放开 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

MERCHANT_SECRET_TOKEN = os.getenv("MERCHANT_SECRET_TOKEN", "canteen-merchant-secret-key")

def verify_merchant_auth(x_merchant_token: str | None = Header(None, alias="X-Merchant-Token")):
    """
    轻量级商家校验，前端请求 Header 中需携带 X-Merchant-Token: <token>
    """
    if not x_merchant_token or x_merchant_token != MERCHANT_SECRET_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="商家鉴权失败，无效或未提供商家 Token"
        )


# =====================================================================
# 食堂与档口基础查询 API
# =====================================================================

@app.get("/api/canteens", response_model=list[CanteenOut])
def list_canteens(db: Session = Depends(get_db)):
    return db.scalars(
        select(Canteen).where(Canteen.is_active.is_(True)).order_by(Canteen.id)
    ).all()


@app.get("/api/canteens/{canteen_id}/stalls", response_model=list[StallOut])
def list_stalls(canteen_id: int, db: Session = Depends(get_db)):
    if db.get(Canteen, canteen_id) is None:
        raise HTTPException(404, "食堂不存在")
    return db.scalars(
        select(Stall).where(Stall.canteen_id == canteen_id).order_by(Stall.id)
    ).all()


@app.get("/api/stalls/{stall_id}", response_model=StallOut)
def get_stall(stall_id: int, db: Session = Depends(get_db)):
    stall = db.get(Stall, stall_id)
    if stall is None:
        raise HTTPException(404, "档口不存在")
    return stall


@app.get("/api/stalls/{stall_id}/dishes", response_model=list[DishOut])
def list_dishes(stall_id: int, db: Session = Depends(get_db)):
    return db.scalars(
        select(Dish)
        .where(Dish.stall_id == stall_id, Dish.is_active.is_(True))
        .order_by(Dish.id)
    ).all()


@app.get("/api/stalls/{stall_id}/menu", response_model=list[MenuOut])
def get_daily_menu(
    stall_id: int,
    service_date: date = Query(default_factory=date.today, alias="date"),
    meal_period: str = Query(
        default="lunch", pattern="^(breakfast|lunch|dinner)$"
    ),
    db: Session = Depends(get_db),
):
    return db.scalars(
        select(DailyMenu)
        .options(selectinload(DailyMenu.dish))
        .where(
            DailyMenu.stall_id == stall_id,
            DailyMenu.service_date == service_date,
            DailyMenu.meal_period == meal_period,
        )
        .order_by(DailyMenu.id)
    ).all()




def _load_order(db: Session, order_id: int) -> Order:
    order = db.scalar(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.id == order_id)
    )
    if order is None:
        raise HTTPException(404, "订单不存在")
    return order


@app.post(
    "/api/orders", response_model=OrderOut, status_code=status.HTTP_201_CREATED
)
def create_order(payload: OrderCreate, db: Session = Depends(get_db)):
    menu_ids = [item.daily_menu_id for item in payload.items]
    if len(menu_ids) != len(set(menu_ids)):
        raise HTTPException(400, "同一菜品请合并数量后提交")


    menus = db.scalars(
        select(DailyMenu)
        .options(selectinload(DailyMenu.dish), selectinload(DailyMenu.stall))
        .where(DailyMenu.id.in_(menu_ids))
        .with_for_update()
    ).all()
    menu_map = {item.id: item for item in menus}
    if len(menu_map) != len(menu_ids):
        raise HTTPException(404, "部分菜单项不存在")

    stall_ids = {item.stall_id for item in menus}
    service_dates = {item.service_date for item in menus}
    meal_periods = {item.meal_period for item in menus}
    if (
        len(stall_ids) != 1
        or len(service_dates) != 1
        or len(meal_periods) != 1
    ):
        raise HTTPException(
            400, "一笔订单只能购买同一档口、同一餐次的菜品"
        )

    quantities = {
        item.daily_menu_id: item.quantity for item in payload.items
    }
    total = Decimal("0.00")
    for menu in menus:
        quantity = quantities[menu.id]
        if not menu.is_available or menu.stock < quantity:
            raise HTTPException(409, f"{menu.dish.name} 库存不足")
        total += menu.price * quantity

    stall = menus[0].stall
    if not stall.is_open:
        raise HTTPException(409, "档口已暂停营业")

    order = Order(
        stall_id=stall.id,
        customer_name=payload.customer_name,
        customer_no=payload.customer_no,
        pickup_code=None,
        dining_type=payload.dining_type,
        service_date=menus[0].service_date,
        meal_period=menus[0].meal_period,
        requested_pickup_time=payload.requested_pickup_time,
        status="pending",
        total_amount=total,
        note=payload.note,
    )
    db.add(order)
    db.flush()
    order.pickup_code = f"{stall.pickup_prefix}{order.id:04d}"

    for menu in menus:
        quantity = quantities[menu.id]
        menu.stock -= quantity  # 数据库事务锁保证安全的扣减
        order.items.append(
            OrderItem(
                daily_menu_id=menu.id,
                dish_name=menu.dish.name,
                unit_price=menu.price,
                quantity=quantity,
                subtotal=menu.price * quantity,
            )
        )

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    return _load_order(db, order.id)


@app.get("/api/orders/{order_id}", response_model=OrderOut)
def get_order(order_id: int, db: Session = Depends(get_db)):
    return _load_order(db, order_id)


@app.get("/api/orders", response_model=list[OrderOut])
def list_customer_orders(customer_no: str, db: Session = Depends(get_db)):
    return db.scalars(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.customer_no == customer_no)
        .order_by(Order.created_at.desc())
    ).all()


# =====================================================================
# 商家管理 API 与图片上传 
# =====================================================================

@app.post("/api/merchant/upload-dish-image", dependencies=[Depends(verify_merchant_auth)])
async def upload_dish_image(file: UploadFile = File(...)):
    """商家端上传菜品图片接口"""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "仅支持上传图片文件 (JPG, PNG, WebP等)")

    file_extension = Path(file.filename or "").suffix or ".jpg"
    new_filename = f"{uuid.uuid4().hex}{file_extension}"
    file_path = UPLOAD_DIR / new_filename

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(500, f"图片保存失败: {str(e)}")

    image_url = f"/static/dishes/{new_filename}"
    return {"message": "图片上传成功", "image_url": image_url}


@app.get(
    "/api/merchant/stalls/{stall_id}/orders",
    response_model=list[OrderOut],
    dependencies=[Depends(verify_merchant_auth)]
)
def list_merchant_orders(
    stall_id: int,
    order_status: str | None = Query(default=None, alias="status"),
    service_date: date | None = Query(default=None, alias="date"),
    db: Session = Depends(get_db),
):
    stmt = (
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.stall_id == stall_id)
    )
    if order_status:
        stmt = stmt.where(Order.status == order_status)
    if service_date:
        stmt = stmt.where(Order.service_date == service_date)
    return db.scalars(stmt.order_by(Order.created_at.desc())).all()


ALLOWED_TRANSITIONS = {
    "pending": {"accepted", "cancelled"},
    "accepted": {"preparing", "cancelled"},
    "preparing": {"ready"},
    "ready": {"completed"},
    "completed": set(),
    "cancelled": set(),
}


@app.patch(
    "/api/merchant/orders/{order_id}/status",
    response_model=OrderOut,
    dependencies=[Depends(verify_merchant_auth)]
)
def update_order_status(
    order_id: int, payload: StatusUpdate, db: Session = Depends(get_db)
):

    order = db.scalar(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.id == order_id)
        .with_for_update()
    )
    if order is None:
        raise HTTPException(404, "订单不存在")

    if payload.status == order.status:
        return order
    if payload.status not in ALLOWED_TRANSITIONS.get(order.status, set()):
        raise HTTPException(
            409, f"订单不能从 {order.status} 变为 {payload.status}"
        )


    if payload.status == "cancelled" and order.status != "cancelled":
        for item in order.items:
            menu = db.scalar(
                select(DailyMenu)
                .where(DailyMenu.id == item.daily_menu_id)
                .with_for_update()
            )
            if menu:
                menu.stock += item.quantity  

    order.status = payload.status
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    return _load_order(db, order.id)

@app.delete(
    "/api/merchant/menu-items/{menu_id}",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(verify_merchant_auth)]
)
def delete_menu_item(menu_id: int, db: Session = Depends(get_db)):
    """
    商家端下架/删除指定菜品的菜单项
    """
    menu = db.scalar(
        select(DailyMenu).where(DailyMenu.id == menu_id)
    )
    if menu is None:
        raise HTTPException(status_code=404, detail="菜单项不存在或已被下架")
    
    db.delete(menu)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    return {"message": "菜单项已成功下架", "id": menu_id}
 
@app.post(
    "/api/merchant/stalls/{stall_id}/daily-menus",
    response_model=list[MenuOut],
    dependencies=[Depends(verify_merchant_auth)]
)
def publish_daily_menu(
    stall_id: int, payload: DailyMenuPublish, db: Session = Depends(get_db)
):
    stall = db.get(Stall, stall_id)
    if stall is None:
        raise HTTPException(404, "档口不存在")
    dish_ids = [item.dish_id for item in payload.items]
    
    # 允许清空菜单发布（如果 payload.items 为空，则下架当天该餐次所有菜品）
    if dish_ids:
        dishes = db.scalars(
            select(Dish).where(
                Dish.id.in_(dish_ids), Dish.stall_id == stall_id
            )
        ).all()
        if len(dishes) != len(set(dish_ids)):
            raise HTTPException(400, "包含无效、重复或不属于本档口的菜品")

    existing = db.scalars(
        select(DailyMenu).where(
            DailyMenu.stall_id == stall_id,
            DailyMenu.service_date == payload.service_date,
            DailyMenu.meal_period == payload.meal_period,
        )
    ).all()
    
    incoming_dish_ids = set(dish_ids)
    existing_map = {item.dish_id: item for item in existing}


    for item in existing:
        if item.dish_id not in incoming_dish_ids:
            db.delete(item)


    for incoming in payload.items:
        menu = existing_map.get(incoming.dish_id)
        if menu is None:
            menu = DailyMenu(
                stall_id=stall_id,
                dish_id=incoming.dish_id,
                service_date=payload.service_date,
                meal_period=payload.meal_period,
            )
            db.add(menu)
        menu.price = incoming.price
        menu.stock = incoming.stock
        menu.is_available = incoming.is_available

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    return get_daily_menu(stall_id, payload.service_date, payload.meal_period, db)

@app.patch(
    "/api/merchant/menu-items/{menu_id}",
    response_model=MenuOut,
    dependencies=[Depends(verify_merchant_auth)]
)
def update_menu_stock(
    menu_id: int, payload: MenuStockUpdate, db: Session = Depends(get_db)
):
    menu = db.scalar(
        select(DailyMenu)
        .options(selectinload(DailyMenu.dish))
        .where(DailyMenu.id == menu_id)
    )
    if menu is None:
        raise HTTPException(404, "菜单项不存在")
    if payload.stock is not None:
        menu.stock = payload.stock
    if payload.is_available is not None:
        menu.is_available = payload.is_available
    try:
        db.commit()
        db.refresh(menu)
    except Exception:
        db.rollback()
        raise
    return menu


# =====================================================================
# AI 多轮对话与推荐接口
# =====================================================================

MAX_HISTORY_TURNS = 20  # 上下文截断 Bar：保留最多最近 20 条（10 轮）历史对话记录


def _get_or_create_customer_profile(
    customer_no: str, db: Session, memory_updates: list[str] | None = None
) -> CustomerProfile | None:
    if not customer_no:
        return None

    profile = db.scalar(
        select(CustomerProfile).where(CustomerProfile.customer_no == customer_no)
    )
    if not profile:
        profile = CustomerProfile(
            customer_no=customer_no,
            preferences={},
            memory_summary="",
        )
        db.add(profile)
        db.flush()

    if memory_updates and isinstance(memory_updates, list):
        current_text = profile.memory_summary or ""
        new_items = [
            item.strip() for item in memory_updates 
            if isinstance(item, str) and item.strip() and item.strip() not in current_text
        ]
        if new_items:
            appended_text = "；".join(new_items)
            profile.memory_summary = f"{current_text}；{appended_text}".strip("；")
            try:
                db.commit()
                db.refresh(profile)
            except Exception as e:
                db.rollback()
                print(f"[Profile Update Error] {e}")

    return profile


def _extract_valid_nutrition(raw_nut: dict | None, db_energy_kcal: int | None = None) -> NutritionInfo | None:
    if not isinstance(raw_nut, dict):
        raw_nut = {}

    calories = raw_nut.get("calories")
    if calories is None and db_energy_kcal is not None and db_energy_kcal > 0:
        calories = db_energy_kcal

    protein = raw_nut.get("protein")
    fat = raw_nut.get("fat")
    carbs = raw_nut.get("carbs")

    if any(v is not None for v in [calories, protein, fat, carbs]):
        try:
            return NutritionInfo(
                calories=int(calories) if calories is not None else None,
                protein=float(protein) if protein is not None else None,
                fat=float(fat) if fat is not None else None,
                carbs=float(carbs) if carbs is not None else None,
            )
        except (ValueError, TypeError):
            pass

    return None


def _get_user_order_history(customer_no: str, db: Session) -> dict:
    if not customer_no:
        return {"total_orders": 0, "recent_dishes": [], "frequent_dishes": []}

    recent_orders = db.scalars(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.customer_no == customer_no)
        .order_by(Order.created_at.desc())
        .limit(20)
    ).all()

    recent_dishes = []
    for o in recent_orders:
        for item in o.items:
            recent_dishes.append({
                "dish_name": item.dish_name,
                "price": float(item.unit_price),
                "order_time": o.created_at.strftime("%Y-%m-%d %H:%M") if o.created_at else ""
            })

    frequent_query = db.execute(
        select(OrderItem.dish_name, func.count(OrderItem.id).label("count"))
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.customer_no == customer_no)
        .group_by(OrderItem.dish_name)
        .order_by(func.count(OrderItem.id).desc())
        .limit(20)
    ).all()

    frequent_dishes = [{"dish_name": row[0], "buy_count": row[1]} for row in frequent_query]

    return {
        "total_orders_count": len(recent_orders),
        "recent_purchases": recent_dishes[:8],
        "favorite_frequent_dishes": frequent_dishes
    }


# =====================================================================
# Profile 查询与重置 API
# =====================================================================

@app.get("/api/ai/profile/{customer_no}", response_model=CustomerProfileOut)
def get_customer_profile(customer_no: str, db: Session = Depends(get_db)):
    profile = _get_or_create_customer_profile(customer_no, db)
    if not profile:
        raise HTTPException(404, "未找到该用户的 Profile 记录")
    return profile


@app.delete("/api/ai/profile/{customer_no}")
def reset_customer_profile(customer_no: str, db: Session = Depends(get_db)):
    profile = db.scalar(
        select(CustomerProfile).where(CustomerProfile.customer_no == customer_no)
    )
    if profile:
        profile.memory_summary = ""
        profile.preferences = {}
        try:
            db.commit()
        except Exception:
            db.rollback()
            raise
    return {"message": f"用户 {customer_no} 的长期记忆已清空重置"}


@app.post("/api/ai/chat", response_model=AIChatResponse)
async def ai_chat_entry(payload: AIChatRequest, db: Session = Depends(get_db)):
    user_msg = payload.message.strip()
    customer_no = payload.customer_no or ""
    cart = payload.cart or {}
    raw_history = getattr(payload, "history", []) or []

    print(f"[AI Chat Log] POST msg: '{user_msg}', customer_no: '{customer_no}'")

    if not user_msg:
        return AIChatResponse(
            reply="你好呀！想吃点什么？可以跟我说说你的口味偏好、预算，或者问我你上次吃了什么哦~",
            dishes=None
        )

    user_profile = _get_or_create_customer_profile(customer_no, db)
    user_memory_summary = user_profile.memory_summary if user_profile else ""
    user_history_data = _get_user_order_history(customer_no, db)

    available_menus = db.scalars(
        select(DailyMenu)
        .options(selectinload(DailyMenu.dish), selectinload(DailyMenu.stall))
        .where(
            DailyMenu.service_date == date.today(),
            DailyMenu.is_available.is_(True),
            DailyMenu.stock > 0,
        )
    ).all()

    if not available_menus:
        available_menus = db.scalars(
            select(DailyMenu)
            .options(selectinload(DailyMenu.dish), selectinload(DailyMenu.stall))
            .where(DailyMenu.is_available.is_(True))
            .limit(15)
        ).all()

    menu_context = [
        {
            "daily_menu_id": m.id,
            "dish_name": m.dish.name,
            "price": float(m.price),
            "stock_remaining": m.stock,
            "stall_name": m.stall.name if m.stall else "食堂档口",
            "flavor_description": m.dish.description or "暂无口味描述",
            "energy_kcal": getattr(m.dish, "energy_kcal", None),
        }
        for m in available_menus
    ]

    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("LLM_API_KEY")
    api_base = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")
    model_name = os.getenv("LLM_MODEL", "gpt-3.5-turbo")

    fallback_notice = ""

    if api_key:
        try:
            system_prompt = (
                "你是一个熟悉校园食堂的熟客点餐助手，旨在帮助对食堂档口极其熟悉但存在“选择困难”的同学快速做出点餐决策。\n"
                "【核心人设与推荐策略】:\n"
                "1. 破除选择疲劳：熟客最怕“吃腻”或“选不出来”。请综合参考【用户长期记忆】与【用户历史消费数据】，优先推荐用户近期较少食用但符合其长期口味的菜品，或带来微创新搭配。\n"
                "2. 商家库存倾斜：在满足用户偏好/需求的前提下，请隐式优先推荐【今日可用菜品列表】中实时库存余量（stock_remaining）较高的菜品，帮助食堂消库存并保障快速出餐。\n"
                "3. 果断爽快：语言要精炼、直接、有说服力，切忌长篇大论或反复追问。直接给出 1~2 个最具吸引力的方案，帮用户在 5 秒内完成决策。\n"
                "4. 长期记忆抽取：从用户最新的发言中抽取长期的、稳定的个人偏好或约束（如“忌口花生”、“不吃辣”、“少油少盐”、“严格减肥控卡”等）。若有新提取的记忆，请写入 `memory_updates` 列表；若无新发现则返回空列表 `[]`。\n"
                "5. 营养评估：针对推荐的【每一道菜品】根据食材成分单独评估其四大营养成分。若某些数据不确定，请设为 null。\n"
                "6. 强约束规则：所有推荐菜品必须通过 `recommendations` 列表返回，且 `daily_menu_id` 必须严格属于可用菜品列表！\n\n"
                f"【用户长期特征记忆 (Long-term Profile Summary)】:\n{user_memory_summary}\n\n"
                f"【用户历史消费与偏好数据】:\n{json.dumps(user_history_data, ensure_ascii=False)}\n\n"
                f"【今日可用菜品列表及实时库存】:\n{json.dumps(menu_context, ensure_ascii=False)}\n\n"
                f"【用户当前购物车信息】:\n{json.dumps(cart, ensure_ascii=False)}\n\n"
                "【输出格式要求】:\n"
                "你是一个后台数据接口，必须并且只能输出合法且可被 json.loads 解析的 JSON 对象，绝不能包含 JSON 结构之外的任何解释性文本。\n"
                "用户的自然语言回复请统一写入 \"reply\" 字段中。\n"
                "{\n"
                '  "reply": "精炼直接的推荐语（30-80字）",\n'
                '  "memory_updates": ["提取到的新长期记忆或偏好标签（如：不吃辣、忌口花生等）"],\n'
                '  "recommendations": [\n'
                "    {\n"
                '      "daily_menu_id": 123,\n'
                '      "nutrition": {\n'
                '        "calories": 420,\n'
                '        "protein": 18.5,\n'
                '        "fat": 12.0,\n'
                '        "carbs": 60.0\n'
                "      }\n"
                "    }\n"
                "  ]\n"
                "}"
            )

            truncated_history = raw_history[-MAX_HISTORY_TURNS:]
            messages = [{"role": "system", "content": system_prompt}]
            for h in truncated_history:
                role = h.get("role") if isinstance(h, dict) else getattr(h, "role", "user")
                content = h.get("content") if isinstance(h, dict) else getattr(h, "content", "")
                if role in ["user", "assistant"] and content:
                    if role == "assistant" and not content.strip().startswith("{"):
                        content = json.dumps({"reply": content}, ensure_ascii=False)
                    messages.append({"role": role, "content": content})

            messages.append({"role": "user", "content": user_msg})

            res = None
            async with httpx.AsyncClient(timeout=12.0) as client:
                res = await client.post(
                    f"{api_base}/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={
                        "model": model_name,
                        "messages": messages,
                        "temperature": 0.4,
                        "response_format": {"type": "json_object"},
                    },
                )

            if res and res.status_code == 200:
                raw_content = res.json()["choices"][0]["message"]["content"].strip()
                
                json_match = re.search(r"\{.*\}", raw_content, re.DOTALL)
                clean_content = json_match.group(0) if json_match else raw_content

                try:
                    data = json.loads(clean_content)
                    reply_text = data.get("reply") or "为您找到以下菜品参考："
                    recs = data.get("recommendations") or []
                    if not isinstance(recs, list):
                        recs = []

                    memory_updates = data.get("memory_updates") or []
                    if customer_no and memory_updates and isinstance(memory_updates, list):
                        _get_or_create_customer_profile(
                            customer_no, db, memory_updates=memory_updates
                        )

                    recommended_dishes = []
                    seen_ids = set()

                    for item in recs:
                        if not isinstance(item, dict):
                            continue
                        
                        try:
                            tid_int = int(item.get("daily_menu_id"))
                        except (ValueError, TypeError):
                            continue

                        if tid_int in seen_ids:
                            continue

                        target_menu = next((m for m in available_menus if m.id == tid_int), None)
                        if not target_menu:
                            continue

                        seen_ids.add(tid_int)

                        llm_nut = item.get("nutrition") if isinstance(item.get("nutrition"), dict) else None
                        db_energy = getattr(target_menu.dish, "energy_kcal", None)
                        
                        final_nutrition = _extract_valid_nutrition(llm_nut, db_energy)

                        recommended_dishes.append(
                            AIDishOut(
                                id=target_menu.dish.id,
                                daily_menu_id=target_menu.id,
                                name=target_menu.dish.name,
                                price=float(target_menu.price),
                                stall_id=target_menu.stall_id,
                                stall_name=target_menu.stall.name if target_menu.stall else "",
                                energy_kcal=db_energy or 0,
                                nutrition=final_nutrition,
                            )
                        )

                    return AIChatResponse(
                        reply=reply_text,
                        dishes=recommended_dishes if recommended_dishes else None
                    )

                except (json.JSONDecodeError, ValueError) as parse_err:
                    print(f"LLM 解析 JSON 失败: {parse_err}, 原内容: {raw_content}")
                    fallback_notice = "【系统提示：回复格式微调中，已自动为你推荐合适菜品】\n\n"
            else:
                status_code = res.status_code if res else "No Response"
                print(f"LLM API 响应异常, status: {status_code}")
                fallback_notice = "【系统提示：服务连接繁忙，已为你快速匹配菜品】\n\n"

        except Exception as e:
            print(f"大模型 API 异常: {e}")
            fallback_notice = "【系统提示：网络微小波动，已为你快速匹配菜品】\n\n"
    else:
        fallback_notice = "【系统提示：未配置 AI 密钥，以下为本地规则推荐】\n\n"

    budget_match = re.search(r"(\d+)\s*元", user_msg)
    max_budget = float(budget_match.group(1)) if budget_match else None

    candidates = []
    for m in available_menus:
        price = float(m.price)
        name = m.dish.name
        desc = m.dish.description or ""

        if max_budget and price > max_budget:
            continue

        score = 0
        if "清淡" in user_msg or "不辣" in user_msg:
            if "清淡" in desc or "不辣" in desc or "番茄" in name:
                score += 3
        if "辣" in user_msg and ("辣" in desc or "麻辣" in desc or "辣椒" in name):
            score += 3
        if "盖饭" in user_msg and "盖饭" in name:
            score += 3

        candidates.append((score, m))

    candidates.sort(key=lambda x: x[0], reverse=True)

    if candidates:
        take_count = 2 if "两样" in user_msg or "两个" in user_msg else 1
        best_menus = [c[1] for c in candidates[:take_count]]
        
        dish_names = "、".join([m.dish.name for m in best_menus])
        reply_str = f"{fallback_notice}为您找到了：{dish_names}，欢迎品尝！"

        dishes_out = [
            AIDishOut(
                id=m.dish.id,
                daily_menu_id=m.id,
                name=m.dish.name,
                price=float(m.price),
                stall_id=m.stall_id,
                stall_name=m.stall.name if m.stall else "",
                energy_kcal=getattr(m.dish, "energy_kcal", None) or 0,
                nutrition=None,
            )
            for m in best_menus
        ]

        return AIChatResponse(reply=reply_str, dishes=dishes_out)

    return AIChatResponse(
        reply=f"{fallback_notice}抱歉，暂时没有找到完全符合您需求的菜品，建议看看今日推荐其他美味哦！",
        dishes=None,
    )