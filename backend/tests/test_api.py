from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import DailyMenu
from app.seed import seed_database


@pytest.fixture()
def client():
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(bind=test_engine, autoflush=False, expire_on_commit=False)
    Base.metadata.create_all(test_engine)
    with TestingSession() as db:
        seed_database(db)

    def override_get_db():
        with TestingSession() as db:
            yield db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client, TestingSession
    app.dependency_overrides.clear()
    Base.metadata.drop_all(test_engine)


def test_browse_create_order_and_complete_flow(client):
    api, session_factory = client

    canteens = api.get("/api/canteens").json()
    assert len(canteens) == 2
    stalls = api.get(f"/api/canteens/{canteens[0]['id']}/stalls").json()
    assert stalls[0]["pickup_prefix"] == "A"

    menu = api.get(
        f"/api/stalls/{stalls[0]['id']}/menu",
        params={"date": date.today().isoformat(), "meal_period": "lunch"},
    ).json()
    assert len(menu) == 3
    chosen = menu[0]

    response = api.post("/api/orders", json={
        "customer_name": "张同学",
        "customer_no": "20260001",
        "dining_type": "takeaway",
        "requested_pickup_time": "11:45",
        "note": "少辣",
        "items": [{"daily_menu_id": chosen["id"], "quantity": 2}],
    })
    assert response.status_code == 201, response.text
    order = response.json()
    assert order["pickup_code"].startswith("A")
    assert order["status"] == "pending"
    assert order["items"][0]["quantity"] == 2

    with session_factory() as db:
        assert db.get(DailyMenu, chosen["id"]).stock == chosen["stock"] - 2

    for next_status in ("accepted", "preparing", "ready", "completed"):
        response = api.patch(
            f"/api/merchant/orders/{order['id']}/status",
            json={"status": next_status},
        )
        assert response.status_code == 200, response.text
        assert response.json()["status"] == next_status


def test_rejects_invalid_transition_and_insufficient_stock(client):
    api, _ = client
    menu = api.get(
        "/api/stalls/1/menu",
        params={"date": date.today().isoformat(), "meal_period": "lunch"},
    ).json()[0]
    payload = {
        "customer_name": "李老师",
        "customer_no": "T001",
        "dining_type": "dine_in",
        "items": [{"daily_menu_id": menu["id"], "quantity": 1}],
    }
    order = api.post("/api/orders", json=payload).json()

    invalid = api.patch(
        f"/api/merchant/orders/{order['id']}/status",
        json={"status": "ready"},
    )
    assert invalid.status_code == 409

    api.patch(f"/api/merchant/menu-items/{menu['id']}", json={"stock": 0})
    sold_out = api.post("/api/orders", json=payload)
    assert sold_out.status_code == 409
    assert "库存不足" in sold_out.json()["detail"]


def test_daily_menu_publish_and_stock_update(client):
    api, _ = client
    dishes = api.get("/api/stalls/1/dishes").json()
    tomorrow = date.fromordinal(date.today().toordinal() + 1).isoformat()
    response = api.post("/api/merchant/stalls/1/daily-menus", json={
        "service_date": tomorrow,
        "meal_period": "breakfast",
        "items": [{
            "dish_id": dishes[0]["id"],
            "price": "12.50",
            "stock": 25,
            "is_available": True,
        }],
    })
    assert response.status_code == 200, response.text
    assert response.json()[0]["stock"] == 25

