"""AI tutor: a one-to-one spoken teacher (Online Mode prototype).

A conversation starts as plain chat. When the learner asks to study something, or attaches material,
`/plan` analyses it into parts and `/turn` then runs the lesson under the rules in `engine.py`: teach a
part, quiz it, move on only when it is understood, teach again when it is not, and answer doubts and
language or style requests on the way. `/speak` turns a reply into a Sarvam voice.

No accounts and nothing stored: the lesson state lives in the browser and is sent with each turn.
Because anyone can call it, daily caps on turns and on spoken replies protect the budgets.
"""

import logging
import tempfile
from pathlib import Path
from typing import Annotated

import anthropic
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app import db as database
from app.config import settings
from app.tutor import engine, sense
from app.tutor.brain import ClaudeBrain, EmptyReply
from app.tutor.models import Plan, PlanIn, SpeakIn, TurnIn, TurnOut
from app.usage import client_ip, spend
from app.voice.sarvam import SarvamTTS
from app.voice.settings import VoiceSettings
from app.voice.tts import TTSError

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/tutor", tags=["tutor"])

PLAN_COST = 5  # a plan uses the larger model once: count it as five turns against the daily cap
TOO_MUCH = "The teacher has answered a lot of questions today. Please try again tomorrow."

DB = Annotated[Session, Depends(database.get_db)]


def _spend(db: Session, request: Request, kind: str, everyone: int, each: int, n: int = 1) -> None:
    """Today's caps for `kind`: one shared by everyone, one per caller (app/usage.py)."""
    spend(db, kind, [("all", everyone), (client_ip(request), each)], TOO_MUCH, n)


def get_client() -> anthropic.Anthropic:
    if not settings.anthropic_api_key:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "The tutor is not set up yet.")
    return anthropic.Anthropic(api_key=settings.anthropic_api_key)


def get_brain(client: Annotated[anthropic.Anthropic, Depends(get_client)]) -> ClaudeBrain:
    return ClaudeBrain(client)


def get_voice() -> SarvamTTS | None:
    key = VoiceSettings().tts_api_key
    return SarvamTTS(key) if key else None


Brain = Annotated[ClaudeBrain, Depends(get_brain)]


def _busy(e: Exception) -> HTTPException:
    log.warning("tutor: model call failed: %r", e)
    return HTTPException(status.HTTP_502_BAD_GATEWAY, "The teacher could not answer. Try again.")


@router.post("/plan")
def make_plan(body: PlanIn, brain: Brain, request: Request, db: DB) -> Plan:
    if not body.topic.strip() and body.document is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Tell me what to teach.")
    if body.document is not None:
        _spend(
            db,
            request,
            "file_plan",
            settings.tutor_daily_file_plans,
            settings.tutor_ip_daily_file_plans,
        )
    _spend(
        db,
        request,
        "chat",
        settings.tutor_daily_turns,
        settings.tutor_ip_daily_turns,
        PLAN_COST,
    )
    try:
        return brain.plan(body.topic.strip(), body.document, body.language, body.style)
    except (anthropic.APIError, ValidationError, EmptyReply, ValueError) as e:
        raise _busy(e) from e


@router.post("/turn")
def turn(body: TurnIn, brain: Brain, request: Request, db: DB) -> TurnOut:
    _spend(db, request, "chat", settings.tutor_daily_turns, settings.tutor_ip_daily_turns)
    try:
        return engine.step(brain, body)
    except engine.LessonError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e)) from e
    except (anthropic.APIError, ValidationError, EmptyReply) as e:
        raise _busy(e) from e


@router.post("/sense")
def read_signals(body: sense.SenseIn) -> sense.Insight:
    """The perception agents (LangGraph): numbers from the learner's own camera and microphone
    processing in, a hint out. No image or audio ever arrives here, and nothing is stored or logged.
    Off (404) unless SENSE_ENABLED is set: see docs/SENSE.md before turning it on."""
    if not settings.sense_enabled:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found.")
    return sense.analyse(body)  # the first call loads LangGraph (app/tutor/sense/__init__.py)


@router.post("/speak")
def speak(
    body: SpeakIn,
    voice: Annotated[SarvamTTS | None, Depends(get_voice)],
    request: Request,
    db: DB,
) -> Response:
    """The reply as a Sarvam voice (WAV). 503 means "no voice here": the app speaks it itself."""
    if voice is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "No server voice is set up.")
    _spend(db, request, "speak", settings.tutor_daily_voice, settings.tutor_ip_daily_voice)
    with tempfile.TemporaryDirectory() as tmp:
        try:
            wav = voice.synthesize(body.text, body.language, "guide", Path(tmp) / "reply.wav")
        except TTSError as e:
            log.warning("tutor: voice failed: %s", e)
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The voice is busy. Try again.") from e
        return Response(
            wav.read_bytes(), media_type="audio/wav", headers={"Cache-Control": "no-store"}
        )
