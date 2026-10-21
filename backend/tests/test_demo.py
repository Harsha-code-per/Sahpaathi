from fastapi.testclient import TestClient

from app import seed
from app.config import settings
from app.db import Base, SessionLocal, engine
from app.main import app


def test_it_hands_out_the_password_the_accounts_are_seeded_with(monkeypatch):
    monkeypatch.setattr(settings, "demo_password", "pw-for-this-test")
    res = TestClient(app).get("/api/v1/auth/demo")
    assert res.status_code == 200
    assert res.headers["cache-control"] == "no-store"
    body = res.json()
    assert body["password"] == "pw-for-this-test"
    assert {a["role"] for a in body["accounts"]} == {"teacher", "reviewer", "admin"}
    assert all(a["email"].endswith("@sahpaathi.test") for a in body["accounts"])


def test_the_password_it_shows_really_signs_in(monkeypatch):
    Base.metadata.create_all(engine)
    monkeypatch.setattr(settings, "demo_password", "pw-for-this-test")
    with SessionLocal() as db:
        seed.seed(db, settings.demo_password)
    client = TestClient(app)
    shown = client.get("/api/v1/auth/demo").json()
    for account in shown["accounts"]:
        res = client.post(
            "/api/v1/auth/login", json={"email": account["email"], "password": shown["password"]}
        )
        assert res.status_code == 200 and res.json()["role"] == account["role"], account


def test_without_a_demo_password_there_is_nothing_to_show(monkeypatch):
    monkeypatch.setattr(settings, "demo_password", "")
    assert TestClient(app).get("/api/v1/auth/demo").status_code == 404
