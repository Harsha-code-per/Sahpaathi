# ruff: noqa: F811  (pytest fixtures imported from test_api_ivr are redefined as parameters)
"""Real calls through Exotel: the dial request, the flow's webhooks and the phone audio.
Exotel itself is faked; nothing here dials a number."""

import pytest

from app.config import settings
from app.ivr import exotel
from tests.test_api_ivr import api, needs_ffmpeg, queue, voiced  # noqa: F401 (fixtures)
from tests.test_api_packs import make_episode
from tests.test_api_studio import auth

KEY = "w" * 32


@pytest.fixture
def exo(monkeypatch):
    for name, value in {
        "exotel_sid": "sahpaathi1",
        "exotel_api_key": "k",
        "exotel_api_token": "t",
        "exotel_caller_id": "08012345678",
        "exotel_flow_id": "999",
        "exotel_webhook_key": KEY,
        "public_api_url": "https://api.example.test",
    }.items():
        monkeypatch.setattr(settings, name, value)
    dialled: list[tuple[str, int]] = []
    monkeypatch.setattr(
        exotel, "place_call", lambda phone, call_id: dialled.append((phone, call_id))
    )
    return dialled


def ringing(api) -> int:
    admin = auth(api, "admin")
    api.post(f"/api/v1/episodes/{make_episode()}/pack", headers=admin)
    call = queue(api)
    res = api.post(
        f"/api/v1/ivr/calls/{call['id']}/dial", json={"phone": "+919800000001"}, headers=admin
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "in_progress"
    return call["id"]


def test_dialling_needs_exotel_set_up_and_an_admin(api):
    call = queue(api)
    url = f"/api/v1/ivr/calls/{call['id']}/dial"
    assert (
        api.post(url, json={"phone": "+919800000001"}, headers=auth(api, "teacher")).status_code
        == 403
    )
    res = api.post(url, json={"phone": "+919800000001"}, headers=auth(api, "admin"))
    assert res.status_code == 503 and "EXOTEL" in res.json()["detail"]


def test_a_name_is_not_a_phone_number(api, exo):
    call = queue(api)
    res = api.post(
        f"/api/v1/ivr/calls/{call['id']}/dial", json={"phone": "Asha"}, headers=auth(api, "admin")
    )
    assert res.status_code == 422 and exo == []


@needs_ffmpeg
def test_a_real_call_from_ring_to_answer(api, voiced, exo):
    call_id = ringing(api)
    assert exo == [("+919800000001", call_id)]  # the number went to Exotel and nowhere else

    # Exotel's Programmable Gather asks what to play; the audio URLs are signed per call.
    assert api.get(f"/api/v1/ivr/exotel/gather?CustomField={call_id}").status_code == 404  # no key
    g = api.get(f"/api/v1/ivr/exotel/gather?key={KEY}&CustomField={call_id}").json()
    assert g["max_input_digits"] == 1 and g["finish_on_key"] == ""
    start = g["gather_prompt"]["audio_url"].removeprefix("https://api.example.test")
    menu = g["repeat_gather_prompt"]["audio_url"].removeprefix("https://api.example.test")
    wav = api.get(start)
    assert (
        wav.status_code == 200
        and wav.content[:4] == b"RIFF"
        and wav.headers["content-type"] == "audio/wav"
    )
    assert len(wav.content) > len(api.get(menu).content)  # recap + menu is longer than the menu
    assert api.get(start.replace("sig=", "sig=x")).status_code == 404

    # Passthru: "1" plays it again (200 back to the Gather), "2" ends the call (302 to Hangup).
    passthru = f"/api/v1/ivr/exotel/passthru?key={KEY}&CustomField={call_id}"
    assert api.get(f'{passthru}&digits="1"', follow_redirects=False).status_code == 200
    assert api.get(f'{passthru}&digits="2"', follow_redirects=False).status_code == 302
    final = api.get("/api/v1/ivr/calls", headers=auth(api, "admin")).json()[0]
    assert (final["status"], final["outcome"], final["plays"]) == ("completed", "understood", 2)


@needs_ffmpeg
def test_no_key_after_the_repeats_or_a_dropped_call_is_no_response(api, voiced, exo):
    first = ringing(api)
    passthru = f"/api/v1/ivr/exotel/passthru?key={KEY}&CustomField={first}"
    assert api.get(f"{passthru}&digits=", follow_redirects=False).status_code == 302

    second = queue(api, student_ref="13")["id"]
    api.post(
        f"/api/v1/ivr/calls/{second}/dial", json={"phone": "9800000002"}, headers=auth(api, "admin")
    )
    status_url = f"/api/v1/ivr/exotel/status/{second}?key={KEY}"
    assert api.post(status_url, data={"CallSid": "abc", "Status": "no-answer"}).status_code == 200

    calls = {c["id"]: c for c in api.get("/api/v1/ivr/calls", headers=auth(api, "admin")).json()}
    assert calls[first]["status"] == calls[second]["status"] == "no_response"
    assert calls[first]["outcome"] is None


@needs_ffmpeg
def test_a_failed_dial_leaves_the_call_queued(api, voiced, monkeypatch, exo):
    from fastapi import HTTPException

    def refuse(phone, call_id):
        raise HTTPException(502, "Exotel refused the call (401).")

    monkeypatch.setattr(exotel, "place_call", refuse)
    admin = auth(api, "admin")
    api.post(f"/api/v1/episodes/{make_episode()}/pack", headers=admin)
    call = queue(api)
    res = api.post(
        f"/api/v1/ivr/calls/{call['id']}/dial", json={"phone": "+919800000001"}, headers=admin
    )
    assert res.status_code == 502
    assert api.get("/api/v1/ivr/calls", headers=admin).json()[0]["status"] == "queued"
