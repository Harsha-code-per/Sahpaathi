"""Classroom on taps, feedback through /sync, the insights endpoint, the labelled sample data."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app import sample_data
from app.db import Base, SessionLocal, engine
from app.main import app
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


def tap(
    n: int,
    classroom: str | None,
    tap_: str = "most",
    segment: str = "s1",
    days_ago: int = 0,
    auto=False,
):
    return {
        "kind": "tap",
        "event_id": f"real-tap-{classroom}-{segment}-{tap_}-{days_ago}-{n}",
        "episode_id": "ep-one",
        "segment_id": segment,
        "tap": tap_,
        "auto": auto,
        "at": (datetime.now(UTC) - timedelta(days=days_ago)).isoformat(),
        **({"classroom_id": classroom} if classroom else {}),
    }


def feedback(n: int, rating: int = 5, **extra):
    return {
        "kind": "feedback",
        "event_id": f"real-feedback-{n}",
        "episode_id": "ep-one",
        "classroom_id": "G2-A",
        "rating": rating,
        "tags": ["clear"],
        "comment": "",
        "at": datetime.now(UTC).isoformat(),
        **extra,
    }


def sync(api, events):
    res = api.post("/api/v1/sync", json={"events": events})
    assert res.status_code == 200
    return res.json()


def insights(api, data="all"):
    res = api.get(f"/api/v1/insights?data={data}", headers=auth(api, "admin"))
    assert res.status_code == 200, res.text
    return res.json()


def test_taps_may_carry_a_classroom_and_old_phones_without_one_still_work(api):
    out = sync(api, [tap(1, "G2-A"), tap(2, None)])
    assert out["accepted"] == 2 and out["rejected"] == []
    assert {c["classroom_id"] for c in insights(api)["classrooms"]} == {
        "G2-A"
    }  # the one without is not a class


def test_a_classroom_code_must_be_opaque(api):
    out = sync(api, [{**tap(1, "G2-A"), "classroom_id": "Mrs Devi's class"}])
    assert out["accepted"] == 0 and "classroom_id" in out["rejected"][0]["reason"]


def test_feedback_is_stored_once_and_bad_feedback_is_rejected_one_by_one(api):
    out = sync(
        api,
        [
            feedback(1),
            feedback(1),
            feedback(2, rating=9),
            feedback(3, tags=["rude"]),
            feedback(4, nickname="x"),
        ],
    )
    assert out["accepted"] == 1 and out["duplicates"] == 1 and len(out["rejected"]) == 3
    assert insights(api)["feedback"]["count"] == 1


def test_a_class_that_loses_many_children_needs_support_and_a_steady_one_does_not(api):
    steady = [tap(i, "G2-A", "most") for i in range(14)] + [
        tap(i, "G2-A", "some", days_ago=1) for i in range(6)
    ]
    losing = [tap(i, "G2-B", "few") for i in range(10)] + [
        tap(i, "G2-B", "some", days_ago=1) for i in range(8)
    ]
    sync(api, steady + losing)
    by = {c["classroom_id"]: c for c in insights(api)["classrooms"]}
    assert by["G2-A"]["status"] == "doing well" and by["G2-A"]["pct_most"] == 70.0
    assert by["G2-B"]["status"] == "needs support" and by["G2-B"]["pct_few"] > 50
    assert by["G2-B"]["lesson_days"] == 2
    assert [c["classroom_id"] for c in insights(api)["classrooms"]][
        0
    ] == "G2-B"  # who needs help comes first


def test_too_few_taps_say_so_instead_of_inventing_a_percentage(api):
    sync(api, [tap(i, "G2-C", "few") for i in range(3)])
    c = insights(api)["classrooms"][0]
    assert c["status"] == "not enough taps yet" and c["taps"] == 3


def test_the_hardest_part_is_the_one_that_loses_most_children(api):
    sync(
        api,
        [tap(i, "G2-A", "few", "s2") for i in range(9)]
        + [tap(i, "G2-A", "most", "s1") for i in range(9)],
    )
    hardest = insights(api)["hardest_parts"]
    assert hardest[0]["segment_id"] == "s2" and hardest[0]["pct_few"] == 100.0


def test_deliberate_taps_and_automatic_fallbacks_are_counted_apart(api):
    sync(
        api,
        [tap(i, "G2-A", "most") for i in range(9)]
        + [tap(i, "G2-A", "some", "s3", auto=True) for i in range(4)],
    )
    out = insights(api)
    assert out["totals"]["taps"] == 9 and out["totals"]["auto_taps"] == 4
    assert next(s for s in out["segments"] if s["segment_id"] == "s3")["auto"] == 4


def test_feedback_is_summarised(api):
    sync(
        api,
        [
            feedback(1, 5),
            feedback(2, 4, tags=["clear", "too fast"]),
            feedback(3, 2, tags=["audio unclear"]),
        ],
    )
    f = insights(api)["feedback"]
    assert f["count"] == 3 and f["avg_rating"] == 3.67 and f["ratings"]["5"] == 1
    assert f["tags"]["clear"] == 2 and f["by_episode"] == {"ep-one": 3.67}


def test_weeks_are_a_fixed_window_with_zeros_included(api):
    sync(api, [tap(i, "G2-A") for i in range(5)])
    weeks = insights(api)["weeks"]
    assert len(weeks) == 8 and weeks[-1]["taps"] == 5 and weeks[0]["taps"] == 0


def test_only_admins_see_insights(api):
    assert api.get("/api/v1/insights").status_code == 401
    teacher = auth(api, "teacher")
    assert api.get("/api/v1/insights", headers=teacher).status_code == 403
    assert api.post("/api/v1/insights/sample-data", headers=teacher).status_code == 403


# --- the labelled sample data ----------------------------------------------------------------


def load(api):
    res = api.post("/api/v1/insights/sample-data", headers=auth(api, "admin"))
    assert res.status_code == 201
    return res.json()


def test_sample_data_fills_the_dashboard_and_is_always_labelled(api):
    counts = load(api)
    assert counts["taps"] > 200 and counts["calls"] > 20 and counts["feedback"] > 20
    out = insights(api)
    assert out["sample"] == counts
    assert len(out["classrooms"]) == len(sample_data.CLASSROOMS)
    assert all(c["sample"] and c["classroom_id"].startswith("demo-") for c in out["classrooms"])
    statuses = {c["status"] for c in out["classrooms"]}
    assert (
        "needs support" in statuses and "doing well" in statuses
    )  # a believable spread, not all green


def test_sample_data_is_the_same_every_time_and_loading_twice_does_not_double_it(api):
    first = load(api)
    assert load(api) == first


def test_real_data_can_be_viewed_without_the_sample_and_the_other_way_round(api):
    sync(api, [tap(i, "G2-A") for i in range(10)])
    sample = load(api)
    assert insights(api, "real")["totals"]["taps"] == 10
    assert (
        insights(api, "sample")["totals"]["taps"] > 0
        and insights(api, "sample")["totals"]["taps"] != 10
    )
    both = insights(api, "all")["totals"]["taps"]
    assert (
        both >= 10 + sample["taps"] - sample["taps"] // 5
    )  # some sample taps are automatic fallbacks


def test_the_old_dashboard_also_splits_sample_from_real(api):
    admin = auth(api, "admin")
    sync(api, [tap(i, "G2-A") for i in range(10)])
    load(api)
    real = api.get("/api/v1/dashboard?data=real", headers=admin).json()
    both = api.get("/api/v1/dashboard", headers=admin).json()
    assert real["overall"]["taps"] == 10 and both["overall"]["taps"] > 10
    assert real["sample_taps"] > 0 and real["catchup_calls"]["total"] == 0


def test_deleting_the_sample_leaves_the_real_data_alone(api):
    admin = auth(api, "admin")
    sync(api, [tap(i, "G2-A") for i in range(10)] + [feedback(1)])
    load(api)
    gone = api.delete("/api/v1/insights/sample-data", headers=admin)
    assert gone.json() == {"taps": 0, "calls": 0, "feedback": 0}
    out = insights(api)
    assert (
        out["totals"]["taps"] == 10 and out["feedback"]["count"] == 1 and out["sample"]["taps"] == 0
    )


def test_sample_data_never_pretends_to_be_a_testimonial(api):
    load(api)
    with SessionLocal() as db:
        from sqlalchemy import select

        from app.models import LessonFeedback

        comments = {c for (c,) in db.execute(select(LessonFeedback.comment))}
    assert comments == {""}  # invented ratings only, never invented words from a teacher
