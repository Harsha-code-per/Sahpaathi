import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from app import episodes
from app.db import Base, SessionLocal, engine
from app.factory.judge import Review
from app.factory.schema import Episode
from app.factory.scriptwriter import ScriptwriterError
from app.main import app
from app.models import EpisodeRecord
from app.seed import seed

SAMPLES = episodes.settings.content_dir / "samples"
EPISODE = Episode.model_validate_json(
    (SAMPLES / "g1-numbers-to-20-chennai-migrant.json").read_text()
)
REVIEW = Review.model_validate_json(
    (SAMPLES / "g1-numbers-to-20-chennai-migrant.review.json").read_text()
)
NEW = {"lesson_id": "g1-numbers-to-20", "district_id": "chennai-migrant"}


@pytest.fixture
def api():
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed(db, "demo-pass")
    with TestClient(app) as client:
        yield client
    Base.metadata.drop_all(engine)


def auth(api: TestClient, role: str) -> dict:
    res = api.post(
        "/api/v1/auth/login", json={"email": f"{role}@sahpaathi.test", "password": "demo-pass"}
    )
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['token']}"}


def test_login_rejects_wrong_password_and_unknown_user(api):
    bad = {"email": "reviewer@sahpaathi.test", "password": "nope"}
    assert api.post("/api/v1/auth/login", json=bad).status_code == 401
    unknown = {"email": "x@y.z", "password": "demo-pass"}
    assert api.post("/api/v1/auth/login", json=unknown).status_code == 401


def test_studio_needs_a_reviewer(api):
    assert api.get("/api/v1/episodes").status_code == 401
    bogus = {"Authorization": "Bearer not-a-token"}
    assert api.get("/api/v1/episodes", headers=bogus).status_code == 401
    assert api.post("/api/v1/episodes", json=NEW, headers=auth(api, "teacher")).status_code == 403


def test_catalog_lists_content_files(api):
    cat = api.get("/api/v1/catalog", headers=auth(api, "reviewer")).json()
    assert {"g1-numbers-to-20", "g2-place-value"} <= {ls["id"] for ls in cat["lessons"]}
    assert "mayurbhanj-santali" in {d["id"] for d in cat["districts"]}


def test_generate_runs_in_background_then_waits_for_review(api, monkeypatch):
    monkeypatch.setattr(episodes.judge, "generate", lambda *a: (EPISODE, REVIEW))
    h = auth(api, "reviewer")
    res = api.post("/api/v1/episodes", json=NEW, headers=h)
    assert res.status_code == 202 and res.json()["status"] == "generating"
    detail = api.get(f"/api/v1/episodes/{res.json()['id']}", headers=h).json()
    assert detail["status"] == "in_review" and detail["title"] == EPISODE.title
    assert detail["passed"] is False and detail["scores"]["accuracy"] == 4
    assert len(detail["review"]["gloss"]) == len(EPISODE.lines())


def test_generation_failure_is_recorded(api, monkeypatch):
    def boom(*a):
        raise ScriptwriterError("generation stopped: refusal")

    monkeypatch.setattr(episodes.judge, "generate", boom)
    h = auth(api, "admin")
    rec = api.post("/api/v1/episodes", json=NEW, headers=h).json()
    detail = api.get(f"/api/v1/episodes/{rec['id']}", headers=h).json()
    assert detail["status"] == "failed" and "refusal" in detail["error"]


def test_unknown_lesson_is_404(api):
    body = {**NEW, "lesson_id": "nope"}
    assert api.post("/api/v1/episodes", json=body, headers=auth(api, "admin")).status_code == 404


def test_review_decision_rules(api, monkeypatch):
    monkeypatch.setattr(episodes.judge, "generate", lambda *a: (EPISODE, REVIEW))
    h = auth(api, "reviewer")
    eid = api.post("/api/v1/episodes", json=NEW, headers=h).json()["id"]
    url = f"/api/v1/episodes/{eid}/review"
    assert api.post(url, json={"decision": "reject"}, headers=h).status_code == 422  # needs notes
    done = api.post(
        url, json={"decision": "approve", "notes": "Checked by a Tamil speaker."}, headers=h
    )
    assert done.status_code == 200
    assert done.json()["status"] == "approved" and done.json()["reviewed_by"] == "Demo Reviewer"
    assert api.post(url, json={"decision": "reject", "notes": "x"}, headers=h).status_code == 409
    listed = api.get("/api/v1/episodes", headers=h).json()
    assert [e["status"] for e in listed] == ["approved"]


def test_restart_fails_orphaned_generations(api):
    with SessionLocal() as db:
        db.add(EpisodeRecord(lesson_id="a", district_id="b", created_by_id=1))
        db.commit()
        episodes.fail_orphans(db)
        rec = db.scalar(episodes.select(EpisodeRecord))
        assert rec.status == "failed" and "restarted" in rec.error


def test_database_refuses_a_decision_without_a_reviewer(api):
    with SessionLocal() as db:
        db.add(
            EpisodeRecord(
                lesson_id="a",
                district_id="b",
                created_by_id=1,
                status="approved",
                episode={},
                review={},
            )
        )
        with pytest.raises(IntegrityError):
            db.commit()
