"""Teacher recordings: a teacher records her own voice for a topic (subject, then grade, then topic), the
phone sends it when there is a signal, and an AI reviews it.

The flow (docs/API.md):
  1. PUT /api/v1/recordings/{id}   the audio as the raw body, the details in the query. The id is made on the
                                   phone, so a retry over a 2G link stores one recording, not two.
  2. A background task transcribes it (Sarvam speech-to-text) and Claude Haiku scores it against the topic's
     script: clarity, accuracy, pace, child-friendliness, safety, plus up to four tips.
  3. GET /api/v1/recordings        her recordings with their review (a reviewer or admin sees all of them).

No new dependency: the audio is the raw request body (no multipart parser) and Sarvam is called with urllib,
as app/voice/sarvam.py does. A recording is a voice, so every route needs a login.
"""

import json
import logging
import re
import urllib.error
import urllib.request
import uuid
from collections.abc import Callable
from typing import Annotated, Literal

import anthropic
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Request,
    Response,
    status,
)
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import db as database
from app.auth import require
from app.config import settings
from app.factory.judge import JudgeError, _ask
from app.models import TeacherRecording, User
from app.voice.settings import VoiceSettings

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/recordings", tags=["recordings"])
DB = Annotated[Session, Depends(database.get_db)]
Teacher = Annotated[User, Depends(require("teacher", "reviewer", "admin"))]

MAX_BYTES = 4 * 1024 * 1024  # about 4 minutes of opus at 128 kbps; phones send ~24 kbps
SLUG = r"^[a-z0-9][a-z0-9-]*$"
STT_URL = "https://api.sarvam.ai/speech-to-text"
STT_MODEL = "saarika:v2.5"
STT_CODES = {"ta": "ta-IN", "hi": "hi-IN", "or": "od-IN", "en": "en-IN"}

Transcribe = Callable[[bytes, str, str], str]


class Review(BaseModel):
    """What the AI reviewer says about one recording. Scores are 1 (unusable) to 5 (ready for children)."""

    clarity: int = Field(ge=1, le=5)
    accuracy: int = Field(ge=1, le=5)
    pace: int = Field(ge=1, le=5)
    child_friendly: int = Field(ge=1, le=5)
    safe: bool
    summary: str
    tips: list[str] = Field(max_length=4)


class RecordingOut(BaseModel):
    id: str
    episode_id: str
    subject: str
    grade: int
    duration_sec: float
    status: str
    transcript: str | None
    review: dict | None
    created_at: str


def _out(r: TeacherRecording) -> RecordingOut:
    return RecordingOut(
        id=r.id,
        episode_id=r.episode_id,
        subject=r.subject,
        grade=r.grade,
        duration_sec=r.duration_sec,
        status=r.status,
        transcript=r.transcript,
        review=r.review,
        created_at=r.created_at.isoformat() if r.created_at else "",
    )


@router.put("/{rec_id}")
async def upload(
    rec_id: str,
    request: Request,
    background: BackgroundTasks,
    db: DB,
    user: Teacher,
    episode_id: Annotated[str, Query(max_length=100, pattern=SLUG)],
    subject: Literal["numeracy", "literacy"],
    grade: Annotated[int, Query(ge=1, le=8)],
    duration_sec: Annotated[float, Query(ge=1, le=600)],
    lang: Literal["ta", "hi", "or", "en"] = "en",
    classroom_id: Annotated[str | None, Query(pattern=r"^[A-Za-z0-9][A-Za-z0-9-]{0,39}$")] = None,
) -> RecordingOut:
    if not re.fullmatch(r"[A-Za-z0-9-]{8,64}", rec_id):
        raise HTTPException(422, "Bad recording id.")
    existing = db.get(TeacherRecording, rec_id)
    if existing is not None:
        if existing.user_id != user.id:
            raise HTTPException(status.HTTP_409_CONFLICT, "That recording id is taken.")
        return _out(existing)  # a retry: already stored, and it keeps its review
    if int(request.headers.get("content-length") or 0) > MAX_BYTES:
        raise HTTPException(413, "Recording too long to send.")
    audio = await request.body()
    if not audio:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No audio was sent.")
    if len(audio) > MAX_BYTES:
        raise HTTPException(413, "Recording too long to send.")
    rec = TeacherRecording(
        id=rec_id,
        user_id=user.id,
        episode_id=episode_id,
        subject=subject,
        grade=grade,
        duration_sec=duration_sec,
        lang=lang,
        classroom_id=classroom_id,
        mime=(request.headers.get("content-type") or "audio/webm").split(";")[0][:60],
        audio=audio,
        status="received",
    )
    db.add(rec)
    db.commit()
    background.add_task(review_recording, rec_id)
    return _out(rec)


@router.get("")
def mine(db: DB, user: Teacher) -> list[RecordingOut]:
    q = select(TeacherRecording).order_by(TeacherRecording.created_at.desc()).limit(200)
    if user.role == "teacher":
        q = q.where(TeacherRecording.user_id == user.id)
    return [_out(r) for r in db.scalars(q)]


@router.get("/{rec_id}/audio")
def audio(rec_id: str, db: DB, user: Teacher) -> Response:
    r = db.get(TeacherRecording, rec_id)
    if r is None or (user.role == "teacher" and r.user_id != user.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such recording.")
    return Response(r.audio, media_type=r.mime)


# ---- the AI review ---------------------------------------------------------------------------------------------


def script_of(episode_id: str) -> str | None:
    """The topic's teaching lines, so the reviewer can check the teacher said what the lesson teaches."""
    for path in (
        settings.content_dir / "samples" / f"{episode_id}.json",
        settings.content_dir / "episodes" / f"{episode_id}.json",
    ):
        if path.is_file():
            data = json.loads(path.read_text(encoding="utf-8"))
            ep = data.get("episode", data)
            lines = [f"[{ln['lang']}] {ln['text']}" for s in ep["segments"] for ln in s["teach"]]
            return f"{ep['title']}\n" + "\n".join(lines)
    return None


def stt_sarvam(audio: bytes, mime: str, lang: str) -> str:
    """Speech to text with Sarvam saarika (Tamil, Hindi, Odia, English). Raises on any failure."""
    key = VoiceSettings().tts_api_key
    if not key:
        raise LookupError("speech-to-text is not configured (TTS_API_KEY)")
    boundary = uuid.uuid4().hex
    ext = "ogg" if "ogg" in mime else "mp4" if "mp4" in mime else "webm"
    parts = [
        ("model", STT_MODEL),
        ("language_code", STT_CODES.get(lang, "unknown")),
    ]
    body = b"".join(
        f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
        for k, v in parts
    )
    body += (
        (
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.{ext}"\r\n'
            f"Content-Type: {mime}\r\n\r\n"
        ).encode()
        + audio
        + f"\r\n--{boundary}--\r\n".encode()
    )
    req = urllib.request.Request(
        STT_URL,
        data=body,
        headers={
            "api-subscription-key": key,
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return str(json.load(r).get("transcript", "")).strip()
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        raise RuntimeError(f"speech-to-text failed: {e}") from e


REVIEW_SYSTEM = """You review a teacher's own voice recording for a primary-school lesson in India, \
read as a transcript. The teacher is recording the topic so it can be played to children in grades 1 to 3, \
usually in their home language. You get the topic's script (what the lesson teaches) and the transcript of \
what she said.

Score 1 (unusable) to 5 (ready for children): clarity (short, plain sentences a child can follow by ear), \
accuracy (what she says is correct and matches the lesson; every number and fact), pace (judged from the \
length of the transcript against the recording's duration: about 100 to 130 words a minute is right; \
much faster is too fast, much slower has long gaps), child_friendly (warm, familiar words, gives children \
something to say or do). Set safe to false only for harmful, shaming, frightening or unsafe content.
The transcript comes from automatic speech recognition, so ignore spelling slips; do not mark a score \
down for a word the recogniser probably misheard. Write the summary in one or two kind sentences and give \
at most four specific tips, each one short and doable. If the transcript is empty or unrelated to the \
topic, score everything 1 and say so in the summary."""


def review_recording(
    rec_id: str,
    transcribe: Transcribe = stt_sarvam,
    ask: Callable[[str], Review] | None = None,
) -> None:
    """Transcribe, then review. Runs in the background with its own session. Never raises: a failure is
    recorded on the row so the teacher sees why there is no review."""
    with database.SessionLocal() as db:
        rec = db.get(TeacherRecording, rec_id)
        if rec is None:
            return
        try:
            rec.transcript = transcribe(rec.audio, rec.mime, rec.lang)
            if ask is None:
                if not settings.anthropic_api_key:
                    raise LookupError("AI review is not configured (ANTHROPIC_API_KEY)")
                client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

                def ask(prompt: str) -> Review:
                    return _ask(client, REVIEW_SYSTEM, prompt, Review)

            script = script_of(rec.episode_id) or f"(no script on file; topic id {rec.episode_id})"
            words = len(rec.transcript.split())
            rec.review = ask(
                f"Topic script:\n{script}\n\nRecording: {rec.duration_sec:.0f} seconds, {words} words.\n"
                f"Transcript:\n{rec.transcript or '(nothing recognised)'}"
            ).model_dump()
            rec.status = "reviewed"
        except (LookupError, RuntimeError, JudgeError, anthropic.APIError) as e:
            log.warning("recording %s not reviewed: %s", rec_id, e)
            rec.status = "unreviewed"
            rec.review = {"note": str(e)[:300]}
        db.commit()
