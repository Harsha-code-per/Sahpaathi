"""Real catch-up calls through Exotel, driving the same state machine as the keypad simulator.

The call flow is built once in Exotel's App Bazaar (docs/EXOTEL.md):

    Programmable Gather  GET /exotel/gather    -> plays the recap and the menu, takes one key
    Passthru             GET /exotel/passthru  -> 200: back to the Gather (hear it again)
                                                  302: Hangup (the parent answered, or gave up)

No phone number is stored: the admin types one to place a call, it goes to Exotel and is dropped.
A consented contact list per classroom is the production step (app/models.py, CatchupCall).
"""

import base64
import hashlib
import hmac
import json
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, undefer

from app.config import settings
from app.ivr import flow
from app.ivr.routes import DB, Admin, CallOut, _get, _out, begin
from app.models import CatchupCall, PackRecord
from app.usage import spend

router = APIRouter(prefix="/api/v1/ivr", tags=["ivr"])
Part = Literal["start", "menu"]  # start = recap then menu; menu = the 1-2-3 question alone
ENDED = {"failed", "busy", "no-answer", "canceled", "completed"}
KEY_WAIT_SEC = 8  # as the Admin simulator: seconds a parent has to press a key


def configured() -> bool:
    s = settings
    return all((s.exotel_sid, s.exotel_api_key, s.exotel_api_token, s.exotel_caller_id))


def _webhook(key: Annotated[str, Query()] = "") -> None:
    """Exotel's requests are not signed, so its URLs carry a shared secret instead."""
    expected = settings.exotel_webhook_key
    if not expected or not hmac.compare_digest(key, expected):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found.")


Webhook = Annotated[None, Depends(_webhook)]


def _sig(call_id: int, part: str) -> str:
    msg = f"exotel-audio:{call_id}:{part}".encode()
    return hmac.new(settings.jwt_secret.encode(), msg, hashlib.sha256).hexdigest()[:32]


def _api(path: str) -> str:
    return f"{settings.public_api_url.rstrip('/')}/api/v1/ivr{path}"


def audio_url(call_id: int, part: Part) -> str:
    return _api(f"/exotel/audio/{call_id}/{part}.wav?sig={_sig(call_id, part)}")


def place_call(phone: str, call_id: int) -> str:
    """Asks Exotel to ring `phone` and run the flow; returns Exotel's call sid."""
    s = settings
    form = {
        "From": phone,
        "CallerId": s.exotel_caller_id,
        "Url": f"http://my.exotel.com/{s.exotel_sid}/exoml/start_voice/{s.exotel_flow_id}",
        "CustomField": str(call_id),
        "CallType": "trans",
        "TimeLimit": "900",
        "StatusCallback": _api(f"/exotel/status/{call_id}?key={s.exotel_webhook_key}"),
    }
    req = urllib.request.Request(
        f"https://{s.exotel_subdomain}/v1/Accounts/{s.exotel_sid}/Calls/connect.json",
        data=urllib.parse.urlencode(form).encode(),
        method="POST",
    )
    token = base64.b64encode(f"{s.exotel_api_key}:{s.exotel_api_token}".encode()).decode()
    req.add_header("Authorization", f"Basic {token}")
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return json.load(res)["Call"]["Sid"]
    except urllib.error.HTTPError as e:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, f"Exotel refused the call ({e.code})."
        ) from e
    except (urllib.error.URLError, TimeoutError, KeyError, ValueError) as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not reach Exotel.") from e


class DialIn(BaseModel):
    # Used once to place the call, never stored or logged.
    phone: str = Field(pattern=r"^\+?[0-9]{10,15}$")


@router.post("/calls/{call_id}/dial")
def dial(call_id: int, body: DialIn, _: Admin, db: DB) -> CallOut:
    if not configured() or not settings.public_api_url or not settings.exotel_flow_id:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Real calls are not set up yet: add the EXOTEL_* settings and PUBLIC_API_URL.",
        )
    # The demo admin login is public, so real calls go only to listed numbers, a few a day.
    if body.phone.lstrip("+")[-10:] not in {
        n.lstrip("+")[-10:] for n in settings.exotel_allowed_numbers
    }:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "This number is not on the call list (EXOTEL_ALLOWED_NUMBERS), so it was not called.",
        )
    spend(
        db,
        "call",
        [("all", settings.exotel_daily_calls)],
        f"Today's limit of {settings.exotel_daily_calls} real calls is reached. Try tomorrow.",
    )
    call, _ = begin(db, call_id)
    try:
        place_call(body.phone, call.id)
    except HTTPException:
        call.status, call.pack_id = "queued", None  # nothing rang: let the admin try again
        db.commit()
        raise
    return _out(call)


@router.get("/exotel/gather")
def gather(_: Webhook, db: DB, CustomField: str = "") -> dict:
    """Programmable Gather: what to play and how to read the key (Exotel's JSON contract)."""
    call = _call(db, CustomField)
    return {
        "gather_prompt": {"audio_url": audio_url(call.id, "start")},
        "max_input_digits": 1,
        "finish_on_key": "",
        "input_timeout": KEY_WAIT_SEC,
        # Exotel repeats the menu itself when nothing is pressed; flow.MAX_MISSED menus in all.
        "repeat_menu": flow.MAX_MISSED - 1,
        "repeat_gather_prompt": {"audio_url": audio_url(call.id, "menu")},
    }


@router.get("/exotel/passthru")
def passthru(_: Webhook, db: DB, CustomField: str = "", digits: str = "") -> Response:
    """Applies the key. 200 sends Exotel back to the Gather to hear it again; 302 hangs up."""
    call = _call(db, CustomField)
    if call.status != "in_progress":
        return Response(status_code=status.HTTP_302_FOUND)
    digit = digits.strip().strip('"') or None
    if digit is None:  # Exotel already repeated the menu: nobody is pressing
        step = flow.Step((), gather=False, hangup=True)
    else:
        step, progress = flow.press(digit, flow.Progress(call.plays, call.missed))
        call.plays, call.missed = progress.plays, progress.missed
    if step.hangup:
        call.status = "completed" if step.outcome else "no_response"
        call.outcome = step.outcome
    db.commit()
    return Response(status_code=status.HTTP_302_FOUND if step.hangup else status.HTTP_200_OK)


@router.api_route("/exotel/status/{call_id}", methods=["GET", "POST"])
async def call_status(call_id: int, request: Request, _: Webhook, db: DB) -> dict:
    """Exotel's StatusCallback: a call that ended before the parent answered has no response."""
    form = await request.form() if request.method == "POST" else request.query_params
    call = _get(db, call_id)
    if str(form.get("Status", "")).lower() in ENDED and call.status == "in_progress":
        call.status = "no_response"
        db.commit()
    return {"ok": True}


@router.get("/exotel/audio/{call_id}/{part}.wav")
def audio(call_id: int, part: Part, db: DB, sig: str = "") -> Response:
    """Phone-quality WAV for Exotel to fetch: signed per call, since Exotel sends no login."""
    if not hmac.compare_digest(sig, _sig(call_id, part)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found.")
    call = _get(db, call_id)
    if call.pack_id is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This call has no audio yet.")
    return Response(_wav(db, call.pack_id, part), media_type="audio/wav")


def _call(db: Session, custom_field: str) -> CatchupCall:
    if not custom_field.isdigit():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown call.")
    return _get(db, int(custom_field))


def _wav(db: Session, pack_id: int, part: Part) -> bytes:
    audio_cols = [undefer(PackRecord.recap), undefer(PackRecord.menu)]
    pack = db.get(PackRecord, pack_id, options=audio_cols)
    if pack is None or pack.recap is None or pack.menu is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This pack has no call audio.")
    clips = [pack.recap, pack.menu] if part == "start" else [pack.menu]
    return _to_wav(pack_id, part, tuple(clips))


@lru_cache(maxsize=8)  # ponytail: per-process cache; a pack's call audio never changes
def _to_wav(pack_id: int, part: str, clips: tuple[bytes, ...]) -> bytes:
    """Opus clips joined into one 8 kHz, 16-bit mono WAV, what phone networks play."""
    with tempfile.TemporaryDirectory() as tmp:
        inputs: list[str] = []
        for i, clip in enumerate(clips):
            p = Path(tmp) / f"{i}.opus"
            p.write_bytes(clip)
            inputs += ["-i", str(p)]
        out = Path(tmp) / "out.wav"
        joined = "".join(f"[{i}:a]" for i in range(len(clips)))
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-nostdin", "-y", *inputs,
             "-filter_complex", f"{joined}concat=n={len(clips)}:v=0:a=1",
             "-ar", "8000", "-ac", "1", "-c:a", "pcm_s16le", str(out)],
            check=True, capture_output=True,
        )  # fmt: skip
        return out.read_bytes()
