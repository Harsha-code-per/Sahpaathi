import shutil

import pytest
from fastapi.testclient import TestClient

from app import packs
from app.db import Base, SessionLocal, engine
from app.factory.schema import Episode
from app.main import app
from app.models import EpisodeRecord, PackRecord, User
from app.seed import seed
from app.voice import signing
from app.voice.pack import verify_pack
from app.voice.settings import VoiceSettings
from app.voice.tts import FakeTTS
from tests.test_api_studio import REVIEW, SAMPLES, auth

needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="needs ffmpeg")
KEYS = signing.generate_keypair()
# The 16-line sample keeps the build tests fast: every line goes through ffmpeg twice.
EPISODE = Episode.model_validate_json((SAMPLES / "g1-counting-hi-ta.json").read_text())


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
    """Keys present and the TTS service replaced by tones, so no network and no cost."""
    cfg = VoiceSettings.model_construct(tts_api_key="k", pack_signing_key=KEYS[0])
    monkeypatch.setattr(packs, "VoiceSettings", lambda: cfg)
    monkeypatch.setattr(packs, "make_voice", lambda episode, cfg: FakeTTS())


def make_episode(status: str = "approved") -> int:
    with SessionLocal() as db:
        reviewer = db.query(User).filter_by(role="reviewer").one()
        rec = EpisodeRecord(
            lesson_id="g1-numbers-to-20",
            district_id="chennai-migrant",
            status=status,
            episode=EPISODE.model_dump(),
            review=REVIEW.model_dump(),
            created_by_id=reviewer.id,
            reviewed_by_id=reviewer.id if status == "approved" else None,
        )
        db.add(rec)
        db.commit()
        return rec.id


def test_only_admins_build_packs(api):
    eid = make_episode()
    url = f"/api/v1/episodes/{eid}/pack"
    assert api.post(url).status_code == 401
    assert api.post(url, headers=auth(api, "teacher")).status_code == 403
    assert api.post(url, headers=auth(api, "reviewer")).status_code == 403


def test_only_approved_episodes_get_a_pack(api):
    admin = auth(api, "admin")
    assert api.post("/api/v1/episodes/999/pack", headers=admin).status_code == 404
    res = api.post(f"/api/v1/episodes/{make_episode('in_review')}/pack", headers=admin)
    assert res.status_code == 409 and "in_review" in res.json()["detail"]


@needs_ffmpeg
def test_build_list_and_download_a_verifiable_pack(api, voiced, tmp_path):
    eid = make_episode()
    res = api.post(f"/api/v1/episodes/{eid}/pack", headers=auth(api, "admin"))
    assert res.status_code == 202 and res.json()["status"] == "building"

    teacher = auth(api, "teacher")
    listed = api.get("/api/v1/packs", headers=teacher).json()
    assert len(listed) == 1 and listed[0]["status"] == "ready"
    assert listed[0]["grade"] == EPISODE.grade and listed[0]["district_id"] == "chennai-migrant"
    assert api.get("/api/v1/packs?district_id=madurai-tamil", headers=teacher).json() == []
    assert api.get(f"/api/v1/packs?grade={EPISODE.grade + 1}", headers=teacher).json() == []

    full = api.get(f"/api/v1/packs/{listed[0]['id']}", headers=teacher)
    assert full.status_code == 200 and full.headers["accept-ranges"] == "bytes"
    assert f"{EPISODE.id}.sahpaathi" in full.headers["content-disposition"]
    out = tmp_path / "p.sahpaathi"
    out.write_bytes(full.content)
    assert verify_pack(out, KEYS[1]) == Episode.model_validate(EPISODE.model_dump())
    assert len(full.content) == listed[0]["size_bytes"]


@needs_ffmpeg
def test_range_requests_resume_a_download(api, voiced):
    api.post(f"/api/v1/episodes/{make_episode()}/pack", headers=auth(api, "admin"))
    teacher = auth(api, "teacher")
    pid = api.get("/api/v1/packs", headers=teacher).json()[0]["id"]
    url = f"/api/v1/packs/{pid}"
    full = api.get(url, headers=teacher).content
    n = len(full)

    head = api.get(url, headers={**teacher, "Range": "bytes=0-99"})
    assert head.status_code == 206 and head.content == full[:100]
    assert head.headers["content-range"] == f"bytes 0-99/{n}"
    rest = api.get(url, headers={**teacher, "Range": "bytes=100-"})
    assert head.content + rest.content == full
    tail = api.get(url, headers={**teacher, "Range": "bytes=-50"})
    assert tail.content == full[-50:]
    bad = api.get(url, headers={**teacher, "Range": f"bytes={n + 5}-"})
    assert bad.status_code == 416 and bad.headers["content-range"] == f"bytes */{n}"


def test_parse_range():
    assert packs.parse_range("bytes=0-9", 100) == (0, 9)
    assert packs.parse_range("bytes=90-500", 100) == (90, 99)  # end is clamped
    assert packs.parse_range("bytes=10-", 100) == (10, 99)
    assert packs.parse_range("bytes=-5", 100) == (95, 99)
    assert packs.parse_range("bytes=-500", 100) == (0, 99)
    for bad in ("bytes=100-", "bytes=9-3", "bytes=-0", "bytes=-", "items=0-1", "bytes=a-b", ""):
        assert packs.parse_range(bad, 100) is None


def test_missing_keys_fail_the_pack_clearly_and_hide_it_from_teachers(api, monkeypatch):
    cfg = VoiceSettings.model_construct(tts_api_key="", pack_signing_key="")
    monkeypatch.setattr(packs, "VoiceSettings", lambda: cfg)
    res = api.post(f"/api/v1/episodes/{make_episode()}/pack", headers=auth(api, "admin"))
    assert res.status_code == 202
    mine = api.get("/api/v1/packs", headers=auth(api, "admin")).json()
    assert mine[0]["status"] == "failed" and "TTS_API_KEY" in mine[0]["error"]
    assert api.get("/api/v1/packs", headers=auth(api, "teacher")).json() == []
    assert (
        api.get(f"/api/v1/packs/{mine[0]['id']}", headers=auth(api, "teacher")).status_code == 404
    )


def test_one_build_at_a_time_and_restart_clears_orphans(api):
    eid = make_episode()
    admin = auth(api, "admin")
    with SessionLocal() as db:
        admin_id = db.query(User).filter_by(role="admin").one().id
        db.add(PackRecord(episode_id=eid, created_by_id=admin_id))  # a build "in progress"
        db.commit()
    assert api.post(f"/api/v1/episodes/{eid}/pack", headers=admin).status_code == 409
    with SessionLocal() as db:
        packs.fail_orphans(db)
        pack = db.query(PackRecord).one()
        assert pack.status == "failed" and "restarted" in pack.error


@needs_ffmpeg
def test_admin_can_fetch_the_absentee_call_audio_of_a_ready_pack(api, voiced):
    api.post(f"/api/v1/episodes/{make_episode()}/pack", headers=auth(api, "admin"))
    admin = auth(api, "admin")
    pid = api.get("/api/v1/packs", headers=admin).json()[0]["id"]
    for name in ("recap", "menu"):
        res = api.get(f"/api/v1/packs/{pid}/ivr/{name}", headers=admin)
        assert res.status_code == 200 and res.content.startswith(b"OggS")
        assert res.headers["content-type"] == "audio/ogg"
    assert api.get(f"/api/v1/packs/{pid}/ivr/other", headers=admin).status_code == 422
    assert api.get("/api/v1/packs/999/ivr/recap", headers=admin).status_code == 404
    teacher = auth(api, "teacher")
    assert api.get(f"/api/v1/packs/{pid}/ivr/recap", headers=teacher).status_code == 403
