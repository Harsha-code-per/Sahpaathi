# ruff: noqa: F811  (the api fixture from test_api_studio is redefined as a parameter)
"""The classroom feedback loop: taps per part, and Claude rewriting one part as a new version."""

import json
from datetime import UTC, datetime

import pytest
from stub_client import stub_client

from app import episodes
from app.db import SessionLocal
from app.factory.scriptwriter import ScriptwriterError, rewrite_segment
from app.models import EpisodeRecord, SyncEvent
from tests.test_api_studio import EPISODE, NEW, REVIEW, api, auth  # noqa: F401 (fixture)
from tests.test_factory_scriptwriter import DISTRICT, LESSON

URL = "/api/v1/episodes"
SEG, SEG2 = EPISODE.segments[0].id, EPISODE.segments[1].id


def _segment(title="Count three pebbles again", **over) -> str:
    seg = json.loads(EPISODE.model_dump_json())["segments"][0]
    seg["title"] = title
    seg["teach"][0] = {**seg["teach"][0], **over}
    return json.dumps(seg)


def test_rewrite_replaces_one_part_and_keeps_the_rest():
    client = stub_client(writer=[(_segment(), "end_turn")])
    new = rewrite_segment(LESSON, DISTRICT, EPISODE, SEG, "few got it 70%", client=client)
    assert new.segments[0].title == "Count three pebbles again"
    assert new.segments[1] == EPISODE.segments[1] and new.analogy == EPISODE.analogy
    brief = client.requests["writer"][0]["messages"][0]["content"]
    assert "few got it 70%" in brief and f'segment "{SEG}"' in brief


def test_a_rewrite_that_clashes_with_other_lines_gets_one_repair():
    clash = _segment(id="a1")  # the analogy already uses a1
    client = stub_client(writer=[(clash, "end_turn"), (clash, "end_turn")])
    with pytest.raises(ScriptwriterError, match="still invalid"):
        rewrite_segment(LESSON, DISTRICT, EPISODE, SEG, "note", client=client)
    assert "duplicate line ids" in client.requests["writer"][1]["messages"][-1]["content"]


def _reviewed(api, monkeypatch) -> int:  # noqa: F811
    monkeypatch.setattr(episodes.judge, "generate", lambda *a: (EPISODE, REVIEW))
    return api.post(URL, json=NEW, headers=auth(api, "reviewer")).json()["id"]


def _tap(n: int, seg: str, tap: str, auto: bool = False):
    with SessionLocal() as db:
        for i in range(n):
            ev = {"episode_id": EPISODE.id, "segment_id": seg, "tap": tap, "auto": auto}
            db.add(
                SyncEvent(
                    event_id=f"{seg}-{tap}-{auto}-{i}",
                    at=datetime(2026, 10, 21, 4, tzinfo=UTC),
                    **ev,
                )
            )
        db.commit()


def test_classroom_taps_per_part(api, monkeypatch):  # noqa: F811
    ep = _reviewed(api, monkeypatch)
    _tap(2, SEG, "most")
    _tap(3, SEG, "few")
    _tap(1, SEG, "some", auto=True)
    _tap(4, "s9", "few")  # a part this version no longer has
    parts = api.get(f"{URL}/{ep}/classroom", headers=auth(api, "reviewer")).json()
    assert parts[0] == {"segment_id": SEG, "taps": 5, "most": 2, "some": 0, "few": 3, "auto": 1}
    assert parts[1]["segment_id"] == SEG2 and parts[1]["taps"] == 0


def test_rewriting_a_part_makes_a_new_version_for_review(api, monkeypatch):  # noqa: F811
    ep = _reviewed(api, monkeypatch)
    _tap(3, SEG, "few")
    seen = {}

    def fake_rewrite(lesson, district, episode, segment_id, why, bank):
        seen.update(segment=segment_id, why=why)
        return episode.model_copy(update={"title": "Rewritten"})

    monkeypatch.setattr(episodes.scriptwriter, "rewrite_segment", fake_rewrite)
    monkeypatch.setattr(episodes.judge, "review", lambda *a: REVIEW)
    h = auth(api, "reviewer")
    res = api.post(
        f"{URL}/{ep}/segments/{SEG}/rewrite", json={"note": "Use smaller numbers"}, headers=h
    )
    assert res.status_code == 202 and res.json()["id"] != ep
    new = api.get(f"{URL}/{res.json()['id']}", headers=h).json()
    assert new["status"] == "in_review" and new["title"] == "Rewritten"
    assert seen["segment"] == SEG and "few got it 100%" in seen["why"] and "smaller" in seen["why"]
    assert api.get(f"{URL}/{ep}", headers=h).json()["status"] == "in_review"  # old one untouched


def test_rewrite_needs_a_reason_a_real_part_and_a_written_episode(api, monkeypatch):  # noqa: F811
    ep = _reviewed(api, monkeypatch)
    h = auth(api, "reviewer")
    res = api.post(f"{URL}/{ep}/segments/{SEG}/rewrite", json={}, headers=h)
    assert res.status_code == 422 and "add a note" in res.json()["detail"]
    assert (
        api.post(f"{URL}/{ep}/segments/s7/rewrite", json={"note": "x"}, headers=h).status_code
        == 404
    )
    with SessionLocal() as db:
        db.get(EpisodeRecord, ep).status = "generating"
        db.commit()
    assert (
        api.post(f"{URL}/{ep}/segments/{SEG}/rewrite", json={"note": "x"}, headers=h).status_code
        == 409
    )
