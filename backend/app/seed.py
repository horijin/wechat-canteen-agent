from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Canteen, DailyMenu, Dish, Stall


def seed_database(db: Session) -> None:
    if db.scalar(select(Canteen.id).limit(1)) is not None:
        return

    east = Canteen(name="东区食堂", location="校园东区教学楼旁")
    west = Canteen(name="西区食堂", location="校园西区宿舍楼旁")
    db.add_all([east, west])
    db.flush()

    # 档口定义
    rice = Stall(canteen_id=east.id, name="王师傅盖浇饭", floor="1F", pickup_prefix="A", notice="现炒盖饭，约 10 分钟")
    noodle = Stall(canteen_id=east.id, name="兰州牛肉面", floor="1F", pickup_prefix="B", notice="面条现拉")
    malatang = Stall(canteen_id=east.id, name="川味麻辣烫", floor="2F", pickup_prefix="D", notice="辣度可选，现煮汤底")
    
    dumpling = Stall(canteen_id=west.id, name="北方水饺", floor="2F", pickup_prefix="C", notice="现包现煮")
    roast_meat = Stall(canteen_id=west.id, name="粤式烧腊", floor="1F", pickup_prefix="E", notice="每日新鲜烧制，配例汤")
    teppan = Stall(canteen_id=west.id, name="铁板烧饭", floor="1F", pickup_prefix="F", notice="铁板烫手，注意安全")
    
    db.add_all([rice, noodle, malatang, dumpling, roast_meat, teppan])
    db.flush()

    # 菜品定义
    dishes = [
        # 王师傅盖浇饭 (East - 1F)
        Dish(
            stall_id=rice.id,
            name="宫保鸡丁盖饭",
            description="微辣，可备注免辣",
            default_price=Decimal("15.00"),
            energy_kcal=680,
            nutrition={"protein_g": 26.5, "fat_g": 22.0, "carbs_g": 85.0, "sodium_mg": 780},
        ),
        Dish(
            stall_id=rice.id,
            name="鱼香肉丝盖饭",
            description="酸甜微辣",
            default_price=Decimal("14.00"),
            energy_kcal=650,
            nutrition={"protein_g": 22.0, "fat_g": 24.0, "carbs_g": 80.0, "sodium_mg": 820},
        ),
        Dish(
            stall_id=rice.id,
            name="番茄鸡蛋盖饭",
            description="清淡口味",
            default_price=Decimal("11.00"),
            energy_kcal=520,
            nutrition={"protein_g": 16.0, "fat_g": 14.0, "carbs_g": 78.0, "sodium_mg": 510},
        ),
        Dish(
            stall_id=rice.id,
            name="小炒肉盖饭",
            description="中辣，香辣爽口",
            default_price=Decimal("16.00"),
            energy_kcal=710,
            nutrition={"protein_g": 25.0, "fat_g": 30.0, "carbs_g": 82.0, "sodium_mg": 890},
        ),

        # 兰州牛肉面 (East - 1F)
        Dish(
            stall_id=noodle.id,
            name="牛肉拉面",
            description="经典清汤牛肉面",
            default_price=Decimal("13.00"),
            energy_kcal=540,
            nutrition={"protein_g": 24.0, "fat_g": 12.0, "carbs_g": 72.0, "sodium_mg": 950},
        ),
        Dish(
            stall_id=noodle.id,
            name="番茄鸡蛋面",
            description="不辣",
            default_price=Decimal("11.00"),
            energy_kcal=480,
            nutrition={"protein_g": 15.0, "fat_g": 10.0, "carbs_g": 75.0, "sodium_mg": 480},
        ),
        Dish(
            stall_id=noodle.id,
            name="红烧牛肉干拌面",
            description="微辣，附赠骨汤",
            default_price=Decimal("16.00"),
            energy_kcal=620,
            nutrition={"protein_g": 28.0, "fat_g": 18.0, "carbs_g": 80.0, "sodium_mg": 1020},
        ),

        # 川味麻辣烫 (East - 2F)
        Dish(
            stall_id=malatang.id,
            name="经典骨汤麻辣烫套餐",
            description="含3荤4素及主食（方便面/粉）",
            default_price=Decimal("18.00"),
            energy_kcal=610,
            nutrition={"protein_g": 21.0, "fat_g": 25.0, "carbs_g": 68.0, "sodium_mg": 1100},
        ),
        Dish(
            stall_id=malatang.id,
            name="醇香麻酱拌拌烫",
            description="浓郁芝麻酱，干拌微辣",
            default_price=Decimal("17.50"),
            energy_kcal=690,
            nutrition={"protein_g": 19.5, "fat_g": 32.0, "carbs_g": 70.0, "sodium_mg": 980},
        ),

        # 北方水饺 (West - 2F)
        Dish(
            stall_id=dumpling.id,
            name="猪肉白菜水饺",
            description="12 个/份",
            default_price=Decimal("14.00"),
            energy_kcal=510,
            nutrition={"protein_g": 20.0, "fat_g": 18.0, "carbs_g": 62.0, "sodium_mg": 640},
        ),
        Dish(
            stall_id=dumpling.id,
            name="韭菜鸡蛋水饺",
            description="12 个/份",
            default_price=Decimal("13.00"),
            energy_kcal=450,
            nutrition={"protein_g": 14.0, "fat_g": 12.0, "carbs_g": 66.0, "sodium_mg": 580},
        ),
        Dish(
            stall_id=dumpling.id,
            name="三鲜水饺",
            description="虾仁猪肉木耳，12 个/份",
            default_price=Decimal("18.00"),
            energy_kcal=490,
            nutrition={"protein_g": 23.0, "fat_g": 15.0, "carbs_g": 60.0, "sodium_mg": 610},
        ),

        # 粤式烧腊 (West - 1F)
        Dish(
            stall_id=roast_meat.id,
            name="深井烧鸭饭",
            description="外酥里嫩，配酸梅酱",
            default_price=Decimal("17.00"),
            energy_kcal=720,
            nutrition={"protein_g": 28.0, "fat_g": 29.0, "carbs_g": 75.0, "sodium_mg": 850},
        ),
        Dish(
            stall_id=roast_meat.id,
            name="蜜汁叉烧烧肉双拼饭",
            description="经典双拼，口感丰富",
            default_price=Decimal("20.00"),
            energy_kcal=780,
            nutrition={"protein_g": 32.0, "fat_g": 31.0, "carbs_g": 78.0, "sodium_mg": 910},
        ),

        # 铁板烧饭 (West - 1F)
        Dish(
            stall_id=teppan.id,
            name="黑椒牛肉铁板饭",
            description="配溏心蛋与玉米粒",
            default_price=Decimal("19.00"),
            energy_kcal=730,
            nutrition={"protein_g": 30.0, "fat_g": 26.0, "carbs_g": 88.0, "sodium_mg": 880},
        ),
        Dish(
            stall_id=teppan.id,
            name="照烧鸡腿铁板饭",
            description="甜咸浓郁，小朋友最爱",
            default_price=Decimal("16.00"),
            energy_kcal=690,
            nutrition={"protein_g": 27.0, "fat_g": 21.0, "carbs_g": 86.0, "sodium_mg": 760},
        ),
    ]
    db.add_all(dishes)
    db.flush()

    # 生成明后两天的每日菜单
    for offset in (0, 1):
        service_date = date.today() + timedelta(days=offset)
        for period in ("lunch", "dinner"):
            for dish in dishes:
                db.add(
                    DailyMenu(
                        stall_id=dish.stall_id,
                        dish_id=dish.id,
                        service_date=service_date,
                        meal_period=period,
                        price=dish.default_price,
                        stock=80,
                        is_available=True,
                    )
                )
    db.commit()
