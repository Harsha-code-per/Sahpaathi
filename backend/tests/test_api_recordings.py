import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app import recordings
from app.config import settings
from app.db import Base, SessionLocal, engine
from app.main import app
from app.models import TeacherRecording
from app.recordings import Review
from app.recordings import (
    review_recording as real_review,
)  # bound before the fixture stubs the module's
from app.seed import seed
from tests.test_api_studio import auth

REC = "3f2b1c9e-1111-4000-8000-000000000001"
QUERY = "?episode_id=g1-shapes-ta-en&subject=numeracy&grade=1&duration_sec=42&lang=ta"


@pytest.fixture
def api(monkeypatch):
    # The review runs in the background after each upload and would reach for the network, so the
    # upload tests stub it; the review tests call the real one with fake speech-to-text and a fake judge.
    monkeypatch.setattr(recordings, "review_recording", lambda rec_id: None)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed(db, "demo-pass")
    with TestClient(app) as client:
        yield client
    Base.metadata.drop_all(engine)


def put(api, who="teacher", rec_id=REC, body=b"opus-bytes", query=QUERY):
    return api.put(
        f"/api/v1/recordings/{rec_id}{query}",
        content=body,
        headers={**auth(api, who), "Content-Type": "audio/webm;codecs=opus"},
    )


def stored() -> int:
    with SessionLocal() as db:
        return db.scalar(select(func.count()).select_from(TeacherRecording))


def test_a_recording_needs_a_login(api):
    assert api.put(f"/api/v1/recordings/{REC}{QUERY}", content=b"x").status_code == 401
    assert api.get("/api/v1/recordings").status_code == 401


def test_upload_is_stored_once_even_when_the_phone_retries(api):
    first = put(api)
    assert first.status_code == 200, first.text
    assert first.json()["status"] == "received" and first.json()["grade"] == 1
    assert put(api).status_code == 200  # the retry
    assert stored() == 1


def test_bad_uploads_are_refused(api):
    assert put(api, body=b"").status_code == 400
    assert put(api, query=QUERY.replace("grade=1", "grade=40")).status_code == 422
    assert put(api, query=QUERY.replace("numeracy", "art")).status_code == 422
    assert put(api, query=QUERY.replace("g1-shapes-ta-en", "BAD ID")).status_code == 422
    assert put(api, rec_id="short").status_code == 422
    assert put(api, body=b"x" * (recordings.MAX_BYTES + 1)).status_code == 413
    assert stored() == 0


def test_a_teacher_sees_only_her_own_and_a_reviewer_sees_all(api):
    put(api, "teacher")
    put(api, "reviewer", rec_id="3f2b1c9e-2222-4000-8000-000000000002")
    mine = api.get("/api/v1/recordings", headers=auth(api, "teacher")).json()
    assert [r["id"] for r in mine] == [REC]
    assert len(api.get("/api/v1/recordings", headers=auth(api, "reviewer")).json()) == 2
    ok = api.get(f"/api/v1/recordings/{REC}/audio", headers=auth(api, "teacher"))
    assert ok.content == b"opus-bytes" and ok.headers["content-type"].startswith("audio/webm")
    other = "3f2b1c9e-2222-4000-8000-000000000002"
    assert (
        api.get(f"/api/v1/recordings/{other}/audio", headers=auth(api, "teacher")).status_code
        == 404
    )


def test_the_ai_review_scores_a_transcript_against_the_topic_script(api):
    put(api)
    seen = {}

    def ask(prompt: str) -> Review:
        seen["prompt"] = prompt
        return Review(
            clarity=5,
            accuracy=4,
            pace=4,
            child_friendly=5,
            safe=True,
            summary="Clear.",
            tips=["Pause longer."],
        )

    real_review(REC, transcribe=lambda audio, mime, lang: "இது வட்டம். Circle.", ask=ask)
    with SessionLocal() as db:
        rec = db.get(TeacherRecording, REC)
        assert rec.status == "reviewed" and rec.transcript == "இது வட்டம். Circle."
        assert rec.review["clarity"] == 5 and rec.review["tips"] == ["Pause longer."]
    assert "Shapes around us" in seen["prompt"]  # the script came from content/samples
    assert "42 seconds" in seen["prompt"]


def test_a_failed_review_is_recorded_not_raised(api):
    put(api)

    def broken(audio, mime, lang):
        raise LookupError("speech-to-text is not configured (TTS_API_KEY)")

    real_review(REC, transcribe=broken)
    with SessionLocal() as db:
        rec = db.get(TeacherRecording, REC)
        assert rec.status == "unreviewed" and "not configured" in rec.review["note"]


def test_the_daily_cap_returns_429_but_a_retry_of_a_stored_one_still_works(api, monkeypatch):
    monkeypatch.setattr(settings, "recording_daily_limit", 1)
    assert put(api).status_code == 200
    assert put(api).status_code == 200  # the retry of the stored one is not counted again
    over = put(api, rec_id="3f2b1c9e-3333-4000-8000-000000000003")
    assert over.status_code == 429
    assert stored() == 1
