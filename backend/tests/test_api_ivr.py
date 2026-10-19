import shutil

import pytest
from fastapi.testclient import TestClient

from app import packs
from app.db import Base, SessionLocal, engine
from app.main import app
from app.models import CatchupCall
from app.seed import seed
from app.voice import signing
from app.voice.settings import VoiceSettings
from app.voice.tts import FakeTTS
from tests.test_api_packs import make_episode
from tests.test_api_studio import auth

needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="needs ffmpeg")
CALL = {"classroom_id": "CHN-04", "student_ref": "12", "episode_slug": "g1-counting-hi-ta"}


@pytest.fixture
def api():
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed(db, "demo-pass")
    with TestClient(app) as client:
        yield client
    Base.metadata.drop_all(engine)


@pytest.fixture
def voiced(monkeypatch):
    cfg = VoiceSettings.model_construct(
        tts_api_key="k", pack_signing_key=signing.generate_keypair()[0]
    )
    monkeypatch.setattr(packs, "VoiceSettings", lambda: cfg)
    monkeypatch.setattr(packs, "make_voice", lambda episode, cfg: FakeTTS())


def queue(api, **over) -> dict:
    res = api.post("/api/v1/ivr/calls", json={**CALL, **over}, headers=auth(api, "admin"))
    assert res.status_code == 200, res.text
    return res.json()


def test_calls_are_admin_only(api):
    for role in (None, "teacher", "reviewer"):
        headers = auth(api, role) if role else {}
        assert api.get("/api/v1/ivr/calls", headers=headers).status_code in (401, 403)
        assert api.post("/api/v1/ivr/calls", json=CALL, headers=headers).status_code in (401, 403)


def test_queueing_twice_returns_the_same_call(api):
    first, again = queue(api), queue(api)
    assert first["id"] == again["id"] and first["status"] == "queued"
    assert queue(api, student_ref="13")["id"] != first["id"]
    listed = api.get("/api/v1/ivr/calls", headers=auth(api, "admin")).json()
    assert [c["student_ref"] for c in listed] == ["13", "12"]  # newest first


def test_names_and_phone_numbers_are_not_accepted_as_references(api):
    admin = auth(api, "admin")
    for bad in ("Asha Kumar", "+91 98765 43210", "", "x" * 41):
        res = api.post("/api/v1/ivr/calls", json={**CALL, "student_ref": bad}, headers=admin)
        assert res.status_code == 422, bad


def test_a_call_cannot_start_without_a_ready_pack(api):
    call = queue(api)
    res = api.post(f"/api/v1/ivr/calls/{call['id']}/start", headers=auth(api, "admin"))
    assert res.status_code == 409 and "ready pack" in res.json()["detail"]
    assert api.post("/api/v1/ivr/calls/999/start", headers=auth(api, "admin")).status_code == 404


@needs_ffmpeg
def test_a_full_call_from_ring_to_answer(api, voiced):
    admin = auth(api, "admin")
    api.post(f"/api/v1/episodes/{make_episode()}/pack", headers=admin)
    call = queue(api)
    url = f"/api/v1/ivr/calls/{call['id']}"

    step = api.post(f"{url}/start", headers=admin).json()
    assert [a["name"] for a in step["play"]] == ["recap", "menu"] and step["gather"]
    assert step["status"] == "in_progress"
    audio = api.get(step["play"][0]["url"], headers=admin)  # the simulator plays this
    assert audio.status_code == 200 and audio.content.startswith(b"OggS")
    assert api.post(f"{url}/start", headers=admin).status_code == 409  # already ringing

    again = api.post(f"{url}/press", json={"digit": "1"}, headers=admin).json()
    assert [a["name"] for a in again["play"]] == ["recap", "menu"]
    miss = api.post(f"{url}/press", json={}, headers=admin).json()  # nothing pressed
    assert [a["name"] for a in miss["play"]] == ["menu"] and not miss["hangup"]
    done = api.post(f"{url}/press", json={"digit": "2"}, headers=admin).json()
    assert done["hangup"] and done["status"] == "completed" and done["outcome"] == "understood"

    final = api.get("/api/v1/ivr/calls", headers=admin).json()[0]
    assert (final["status"], final["outcome"], final["plays"]) == ("completed", "understood", 2)
    assert api.post(f"{url}/press", json={"digit": "1"}, headers=admin).status_code == 409


@needs_ffmpeg
def test_a_parent_who_never_answers_ends_with_no_response(api, voiced):
    admin = auth(api, "admin")
    api.post(f"/api/v1/episodes/{make_episode()}/pack", headers=admin)
    url = f"/api/v1/ivr/calls/{queue(api)['id']}"
    api.post(f"{url}/start", headers=admin)
    api.post(f"{url}/press", json={}, headers=admin)
    last = api.post(f"{url}/press", json={}, headers=admin).json()
    assert last["hangup"] and last["status"] == "no_response" and last["outcome"] is None


def test_bad_keys_are_refused_and_the_database_guards_outcomes(api):
    admin = auth(api, "admin")
    call = queue(api)
    with SessionLocal() as db:  # even a bug cannot record an outcome for an unanswered call
        row = db.get(CatchupCall, call["id"])
        row.outcome = "help"
        with pytest.raises(Exception, match="outcome_when_completed|CHECK"):
            db.commit()
    res = api.post(f"/api/v1/ivr/calls/{call['id']}/press", json={"digit": "x"}, headers=admin)
    assert res.status_code == 422
