from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.db import Base, SessionLocal, engine
from app.main import app
from app.models import SyncEvent
from app.seed import seed
from tests.test_api_studio import auth


@pytest.fixture
def api():
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed(db, "demo-pass")
    with TestClient(app) as client:
        yield client
    Base.metadata.drop_all(engine)


def add(episode: str, tap: str, n: int, auto: bool = False, days_ago: int = 0) -> None:
    at = datetime.now(UTC) - timedelta(days=days_ago)
    with SessionLocal() as db:
        for i in range(n):
            db.add(
                SyncEvent(
                    event_id=f"{episode}-{tap}-{auto}-{days_ago}-{i}",
                    episode_id=episode,
                    segment_id="s1",
                    tap=tap,
                    auto=auto,
                    at=at,
                )
            )
        db.commit()


def test_dashboard_is_admin_only(api):
    assert api.get("/api/v1/dashboard").status_code == 401
    for role in ("teacher", "reviewer"):
        assert api.get("/api/v1/dashboard", headers=auth(api, role)).status_code == 403


def test_empty_dashboard_has_no_percentages_and_a_full_calendar(api):
    d = api.get("/api/v1/dashboard", headers=auth(api, "admin")).json()
    assert d["overall"] == {
        "taps": 0, "most": 0, "some": 0, "few": 0,
        "pct_most": None, "pct_some": None, "pct_few": None,
    }  # fmt: skip
    assert d["episodes"] == [] and d["packs_ready"] == 0 and d["catchup_calls"] is None
    assert len(d["last_days"]) == 14 and all(day["taps"] == 0 for day in d["last_days"])
    assert d["last_days"][-1]["date"] == datetime.now(UTC).date().isoformat()


def test_percentages_count_deliberate_taps_and_report_fallbacks_apart(api):
    add("ep-a", "most", 6)
    add("ep-a", "some", 3)
    add("ep-a", "few", 1)
    add("ep-a", "some", 5, auto=True)  # nobody tapped: not "Some got it"
    add("ep-b", "few", 2, days_ago=3)
    d = api.get("/api/v1/dashboard", headers=auth(api, "admin")).json()
    assert d["overall"]["taps"] == 12 and d["overall"]["pct_most"] == 50.0
    assert d["overall"]["pct_few"] == 25.0
    assert d["auto_fallbacks"] == 5
    by_ep = {e["episode_id"]: e for e in d["episodes"]}
    assert by_ep["ep-a"]["pct_most"] == 60.0 and by_ep["ep-a"]["auto_fallbacks"] == 5
    assert by_ep["ep-b"]["pct_few"] == 100.0
    days = {day["date"]: day["taps"] for day in d["last_days"]}
    assert days[datetime.now(UTC).date().isoformat()] == 15  # 10 + 5 auto, all counted as usage
    assert sum(days.values()) == 17


def test_episode_with_only_fallbacks_has_no_percentages(api):
    add("ep-c", "some", 4, auto=True)
    d = api.get("/api/v1/dashboard", headers=auth(api, "admin")).json()
    ep = d["episodes"][0]
    assert ep["episode_id"] == "ep-c" and ep["taps"] == 0 and ep["pct_most"] is None
    assert ep["auto_fallbacks"] == 4


def test_counts_of_episodes_by_status_and_ready_packs(api):
    from app.models import EpisodeRecord, PackRecord, User
    from tests.test_api_studio import EPISODE, REVIEW

    with SessionLocal() as db:
        who = db.query(User).filter_by(role="reviewer").one().id
        approved = EpisodeRecord(
            lesson_id="l", district_id="d", status="approved", created_by_id=who,
            reviewed_by_id=who, episode=EPISODE.model_dump(), review=REVIEW.model_dump(),
        )  # fmt: skip
        failed = EpisodeRecord(
            lesson_id="l", district_id="d", status="failed", created_by_id=who, error="x"
        )
        db.add_all([approved, failed])
        db.flush()
        db.add_all(
            [
                PackRecord(episode_id=approved.id, status="ready", data=b"zip", created_by_id=who),
                PackRecord(episode_id=approved.id, status="building", created_by_id=who),
            ]
        )
        db.commit()
    d = api.get("/api/v1/dashboard", headers=auth(api, "admin")).json()
    assert d["episodes_by_status"] == {"approved": 1, "failed": 1}
    assert d["packs_ready"] == 1
