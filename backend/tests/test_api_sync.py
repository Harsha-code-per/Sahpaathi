import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.db import Base, SessionLocal, engine
from app.main import app
from app.models import SyncEvent


@pytest.fixture
def api():
    Base.metadata.create_all(engine)
    with TestClient(app) as client:
        yield client
    Base.metadata.drop_all(engine)


def tap(n: int = 1, **over) -> dict:
    return {
        "kind": "tap",
        "event_id": f"3f2b1c9e-0000-4000-8000-{n:012d}",
        "episode_id": "g1-numbers-to-20-chennai-migrant",
        "segment_id": "s1",
        "tap": "most",
        "auto": False,
        "at": "2026-10-19T04:30:00.000Z",
        **over,
    }


def stored() -> int:
    with SessionLocal() as db:
        return db.scalar(select(func.count()).select_from(SyncEvent))


def post(api, *events):
    res = api.post("/api/v1/sync", json={"events": list(events)})
    assert res.status_code == 200, res.text
    return res.json()


def test_new_taps_are_stored_and_a_retry_counts_nothing_twice(api):
    first = post(api, tap(1), tap(2, tap="few", auto=True))
    assert first == {"accepted": 2, "duplicates": 0, "rejected": []}
    again = post(api, tap(1), tap(2), tap(3))  # the phone retried and added one
    assert again == {"accepted": 1, "duplicates": 2, "rejected": []}
    assert stored() == 3
    with SessionLocal() as db:
        row = db.get(SyncEvent, tap(2)["event_id"])
        assert (row.tap, row.auto, row.at.year) == ("few", True, 2026)


def test_repeats_inside_one_batch_are_stored_once(api):
    assert post(api, tap(1), tap(1), tap(1))["accepted"] == 1
    assert stored() == 1


def test_one_bad_event_never_fails_the_batch(api):
    out = post(
        api,
        tap(1),
        tap(2, tap="all"),
        tap(3, kind="attendance"),
        tap(4, extra="nope"),
        tap(5, at="2026-10-19T04:30:00"),  # no timezone
        tap(6, episode_id="Bad Id!"),
        {"kind": "tap"},
        tap(7),
    )
    assert out["accepted"] == 2 and out["duplicates"] == 0
    reasons = {r["event_id"]: r["reason"] for r in out["rejected"]}
    assert len(out["rejected"]) == 6
    assert reasons[tap(5)["event_id"]] == "at: needs a timezone"
    assert reasons[tap(2)["event_id"]].startswith("tap:")
    assert None in reasons  # an event without an id is still reported
    assert stored() == 2


def test_empty_batch_and_oversized_batch(api):
    assert post(api) == {"accepted": 0, "duplicates": 0, "rejected": []}
    too_many = api.post("/api/v1/sync", json={"events": [tap(i) for i in range(201)]})
    assert too_many.status_code == 422
    assert stored() == 0


def test_malformed_body_is_a_422_not_a_crash(api):
    assert api.post("/api/v1/sync", json={"events": "nope"}).status_code == 422
    assert api.post("/api/v1/sync", json={}).status_code == 422


def attendance(n: int = 1, absent=("12", "7"), **over) -> dict:
    return {
        "kind": "attendance",
        "event_id": f"7a1d4e22-0000-4000-8000-{n:012d}",
        "classroom_id": "CHN-04",
        "episode_id": "g1-numbers-to-20-chennai-migrant",
        "absent": list(absent),
        "at": "2026-10-19T04:30:00.000Z",
        **over,
    }


def calls() -> list[tuple[str, str, str, str]]:
    from app.models import CatchupCall

    with SessionLocal() as db:
        rows = db.scalars(select(CatchupCall).order_by(CatchupCall.student_ref))
        return [(c.classroom_id, c.student_ref, c.episode_slug, c.status) for c in rows]


def test_absent_children_each_get_one_queued_call(api):
    out = post(api, attendance(1))
    assert out == {"accepted": 1, "duplicates": 0, "rejected": []}
    slug = "g1-numbers-to-20-chennai-migrant"
    assert calls() == [("CHN-04", "12", slug, "queued"), ("CHN-04", "7", slug, "queued")]


def test_a_retried_or_overlapping_attendance_never_queues_a_family_twice(api):
    post(api, attendance(1))
    again = post(api, attendance(1), attendance(2, absent=("7", "12")))  # same children, new event
    assert again == {"accepted": 0, "duplicates": 2, "rejected": []}
    assert len(calls()) == 2
    more = post(api, attendance(3, absent=("12", "30")))  # one old child, one new
    assert more["accepted"] == 1 and len(calls()) == 3


def test_a_day_with_nobody_absent_is_accepted_and_queues_nothing(api):
    assert post(api, attendance(1, absent=()))["accepted"] == 1
    assert calls() == []


def test_taps_and_attendance_can_share_a_batch(api):
    out = post(api, tap(1), attendance(1), tap(1))
    assert out == {"accepted": 2, "duplicates": 1, "rejected": []}
    assert stored() == 1 and len(calls()) == 2


def test_children_must_be_opaque_codes_not_names_or_phone_numbers(api):
    out = post(
        api,
        attendance(1, absent=("Asha Kumar",)),
        attendance(2, absent=("+919876543210",)),
        attendance(3, classroom_id="St Mary's School"),
        attendance(4, absent=("1",) * 101),
        attendance(5, extra="x"),
        {"kind": "mystery", "event_id": "abcdefgh-1234"},
    )
    assert out["accepted"] == 0 and len(out["rejected"]) == 6
    assert out["rejected"][5]["reason"] == "kind: must be tap or attendance"
    assert calls() == []
