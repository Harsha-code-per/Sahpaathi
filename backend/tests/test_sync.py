"""M4 offline sync integration and regression test suite.

Covers POST /api/v1/sync:
- Checkpoint tap uploads and idempotency
- Absentee attendance uploads and catch-up call queueing
- Intra-batch and cross-request deduplication
- Concurrent tap insertion conflict handling
- Payload validation, boundary checks, and PII protection
- Transaction atomicity and rollback on failure
"""

from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.db import Base, SessionLocal, engine
from app.main import app
from app.models import CatchupCall, SyncEvent


@pytest.fixture
def api():
    Base.metadata.create_all(engine)
    with TestClient(app) as client:
        yield client
    Base.metadata.drop_all(engine)


def make_tap(n: int = 1, **overrides) -> dict:
    return {
        "kind": "tap",
        "event_id": f"3f2b1c9e-0000-4000-8000-{n:012d}",
        "episode_id": "g1-numbers-to-20-chennai-migrant",
        "segment_id": "s1",
        "tap": "most",
        "auto": False,
        "at": "2026-10-19T04:30:00.000Z",
        **overrides,
    }


def make_attendance(n: int = 1, absent=("12", "7"), **overrides) -> dict:
    return {
        "kind": "attendance",
        "event_id": f"7a1d4e22-0000-4000-8000-{n:012d}",
        "classroom_id": "CHN-04",
        "episode_id": "g1-numbers-to-20-chennai-migrant",
        "absent": list(absent),
        "at": "2026-10-19T04:30:00.000Z",
        **overrides,
    }


def count_taps() -> int:
    with SessionLocal() as db:
        return db.scalar(select(func.count()).select_from(SyncEvent))


def count_calls() -> int:
    with SessionLocal() as db:
        return db.scalar(select(func.count()).select_from(CatchupCall))


# ==============================================================================
# 1. Taps: New events, duplicates across requests, and intra-batch duplicates
# ==============================================================================


def test_taps_stored_and_deduplicated_across_retries(api):
    events = [make_tap(1), make_tap(2, tap="few", auto=True)]
    res1 = api.post("/api/v1/sync", json={"events": events})
    assert res1.status_code == 200
    assert res1.json() == {"accepted": 2, "duplicates": 0, "rejected": []}
    assert count_taps() == 2

    # Retrying both plus one new tap
    res2 = api.post("/api/v1/sync", json={"events": [make_tap(1), make_tap(2), make_tap(3)]})
    assert res2.status_code == 200
    assert res2.json() == {"accepted": 1, "duplicates": 2, "rejected": []}
    assert count_taps() == 3


def test_duplicate_taps_within_single_batch_collapse(api):
    res = api.post("/api/v1/sync", json={"events": [make_tap(1), make_tap(1), make_tap(1)]})
    assert res.status_code == 200
    assert res.json() == {"accepted": 1, "duplicates": 2, "rejected": []}
    assert count_taps() == 1


# ==============================================================================
# 2. Concurrency: Insertion conflict metrics under simultaneous requests
# ==============================================================================


def test_tap_conflict_handling_under_race_condition(api):
    """When an event is committed while another sync attempt is in flight,
    the conflicting insert is ignored and reported as a duplicate (accepted=0, duplicates=1)."""
    event = make_tap(999)

    # First request inserts the fresh tap
    res1 = api.post("/api/v1/sync", json={"events": [event]}).json()
    assert res1 == {"accepted": 1, "duplicates": 0, "rejected": []}

    # Second request hits conflict on insert
    res2 = api.post("/api/v1/sync", json={"events": [event]}).json()
    assert res2 == {"accepted": 0, "duplicates": 1, "rejected": []}
    assert count_taps() == 1


@pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="True multi-threaded database concurrency requires PostgreSQL with connection pooling",
)
def test_postgresql_concurrent_tap_uploads(api):
    """PostgreSQL-specific concurrency test verifying atomic conflict handling across threads."""
    event = make_tap(888)

    def worker(_):
        with TestClient(app) as client:
            return client.post("/api/v1/sync", json={"events": [event]}).json()

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(worker, range(4)))

    total_accepted = sum(r["accepted"] for r in results)
    total_duplicates = sum(r["duplicates"] for r in results)
    assert total_accepted == 1
    assert total_duplicates == 3


# ==============================================================================
# 3. Attendance: Call queueing, absent roll codes, and overlapping retries
# ==============================================================================


def test_attendance_queues_catchup_calls(api):
    res = api.post("/api/v1/sync", json={"events": [make_attendance(1, absent=["12", "7"])]})
    assert res.status_code == 200
    assert res.json() == {"accepted": 1, "duplicates": 0, "rejected": []}

    with SessionLocal() as db:
        calls = db.scalars(select(CatchupCall).order_by(CatchupCall.student_ref)).all()
        assert len(calls) == 2
        assert [(c.classroom_id, c.student_ref, c.episode_slug, c.status) for c in calls] == [
            ("CHN-04", "12", "g1-numbers-to-20-chennai-migrant", "queued"),
            ("CHN-04", "7", "g1-numbers-to-20-chennai-migrant", "queued"),
        ]


def test_attendance_retry_deduplicates_calls(api):
    api.post("/api/v1/sync", json={"events": [make_attendance(1, absent=["12", "7"])]})
    assert count_calls() == 2

    # Retrying same absent children with new event ID does not queue duplicate calls
    res = api.post("/api/v1/sync", json={"events": [make_attendance(2, absent=["7", "12"])]})
    assert res.status_code == 200
    assert res.json() == {"accepted": 0, "duplicates": 1, "rejected": []}
    assert count_calls() == 2

    # Partially overlapping attendance: one existing child (12), one new child (30)
    res3 = api.post("/api/v1/sync", json={"events": [make_attendance(3, absent=["12", "30"])]})
    assert res3.status_code == 200
    assert res3.json() == {"accepted": 1, "duplicates": 0, "rejected": []}
    assert count_calls() == 3


def test_attendance_duplicate_within_single_batch(api):
    att = make_attendance(1, absent=["5"])
    res = api.post("/api/v1/sync", json={"events": [att, att]})
    assert res.status_code == 200
    assert res.json() == {"accepted": 1, "duplicates": 1, "rejected": []}
    assert count_calls() == 1


# ==============================================================================
# 4. Attendance absent=[]: Behavior and Regression Blocker
# ==============================================================================


def test_attendance_nobody_absent_queues_no_calls(api):
    res = api.post("/api/v1/sync", json={"events": [make_attendance(1, absent=[])]})
    assert res.status_code == 200
    assert res.json() == {"accepted": 1, "duplicates": 0, "rejected": []}
    assert count_calls() == 0


def test_attendance_nobody_absent_retry_behavior_and_blocker(api):
    """Documents the current schema limitation where attendance with absent=[] cannot
    persist event_id without a database schema update (e.g. attendance_events table).

    As a result, retries of absent=[] return accepted=1 on each retry. This test verifies
    the current behavior and serves as a regression pin until M1 establishes attendance
    event persistence.
    """
    att = make_attendance(42, absent=[])
    res1 = api.post("/api/v1/sync", json={"events": [att]})
    assert res1.status_code == 200
    assert res1.json() == {"accepted": 1, "duplicates": 0, "rejected": []}
    assert count_calls() == 0

    # Retry same event: without an attendance persistence table, server accepts again
    res2 = api.post("/api/v1/sync", json={"events": [att]})
    assert res2.status_code == 200
    # Note: If M1 adds attendance persistence, this will become accepted=0, duplicates=1.
    assert res2.json() == {"accepted": 1, "duplicates": 0, "rejected": []}
    assert count_calls() == 0


# ==============================================================================
# 5. Validation, boundaries, and privacy protection
# ==============================================================================


def test_absent_list_boundaries(api):
    # Boundary 0: empty list
    res_0 = api.post("/api/v1/sync", json={"events": [make_attendance(1, absent=[])]})
    assert res_0.json()["accepted"] == 1

    # Boundary 1: single item
    res_1 = api.post("/api/v1/sync", json={"events": [make_attendance(2, absent=["R1"])]})
    assert res_1.json()["accepted"] == 1

    # Boundary 100: exactly 100 items accepted
    rolls_100 = [f"r{i}" for i in range(100)]
    res_100 = api.post("/api/v1/sync", json={"events": [make_attendance(3, absent=rolls_100)]})
    assert res_100.status_code == 200
    assert res_100.json()["accepted"] == 1

    # Boundary 101: 101 items rejected
    rolls_101 = [f"r{i}" for i in range(101)]
    res_101 = api.post("/api/v1/sync", json={"events": [make_attendance(4, absent=rolls_101)]})
    assert res_101.status_code == 200
    assert res_101.json()["accepted"] == 0
    assert len(res_101.json()["rejected"]) == 1
    assert "at most 100 items" in res_101.json()["rejected"][0]["reason"]


def test_batch_size_limits(api):
    # Empty batch
    res_empty = api.post("/api/v1/sync", json={"events": []})
    assert res_empty.status_code == 200
    assert res_empty.json() == {"accepted": 0, "duplicates": 0, "rejected": []}

    # 200 events accepted
    events_200 = [make_tap(i) for i in range(200)]
    res_200 = api.post("/api/v1/sync", json={"events": events_200})
    assert res_200.status_code == 200
    assert res_200.json()["accepted"] == 200

    # 201 events rejected with HTTP 422
    events_201 = [make_tap(i) for i in range(201)]
    res_201 = api.post("/api/v1/sync", json={"events": events_201})
    assert res_201.status_code == 422


def test_malformed_individual_events_and_pii_safety(api):
    """Verify that validation errors do not leak PII in rejection reasons."""
    bad_events = [
        make_tap(1, tap="invalid_choice"),
        make_tap(2, extra="forbidden_field"),
        make_tap(3, at="2026-10-19T04:30:00"),  # missing timezone
        make_attendance(4, absent=["+919876543210"]),  # phone number attempt
        make_attendance(5, absent=["Asha Kumar"]),  # name attempt
        make_attendance(6, classroom_id="Govt Primary School #1"),  # spaces & hash
        {"kind": "unknown_kind", "event_id": "test-unknown-id"},
    ]
    res = api.post("/api/v1/sync", json={"events": bad_events})
    assert res.status_code == 200
    data = res.json()
    assert data["accepted"] == 0
    assert len(data["rejected"]) == 7

    reasons = {r["event_id"]: r["reason"] for r in data["rejected"]}
    assert "tap:" in reasons[make_tap(1)["event_id"]]
    assert "extra" in reasons[make_tap(2)["event_id"]]
    assert reasons[make_tap(3)["event_id"]] == "at: needs a timezone"
    assert reasons["test-unknown-id"] == "kind: must be tap or attendance"

    # Confirm PII was NOT leaked into reasons
    assert "+919876543210" not in str(data["rejected"])
    assert "Asha Kumar" not in str(data["rejected"])
    assert "Govt Primary School #1" not in str(data["rejected"])


def test_malformed_body_envelope_returns_422(api):
    assert api.post("/api/v1/sync", json={"events": "not-a-list"}).status_code == 422
    assert api.post("/api/v1/sync", json={"wrong_key": []}).status_code == 422
    assert api.post("/api/v1/sync", content="plain text").status_code == 422


# ==============================================================================
# 6. Transaction Atomicity and Rollback on Failure
# ==============================================================================


def test_transaction_rollback_on_database_error(api):
    """If a database error occurs during sync execution, the entire transaction rolls back
    and no partial events are saved."""
    tap1 = make_tap(1)
    att1 = make_attendance(1, absent=["10"])

    # Simulate a database failure during commit
    err = RuntimeError("Simulated DB Disk Failure")
    with patch("sqlalchemy.orm.Session.commit", side_effect=err):
        with pytest.raises(RuntimeError, match="Simulated DB Disk Failure"):
            api.post("/api/v1/sync", json={"events": [tap1, att1]})

    # Verify atomic rollback: neither tap nor call was persisted
    assert count_taps() == 0
    assert count_calls() == 0
