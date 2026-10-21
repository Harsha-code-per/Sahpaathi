"""AI tutor: a one-to-one spoken conversation with a patient teacher (Online Mode prototype).

The browser listens (Web Speech API), sends the conversation here, Claude Haiku replies in a few
short sentences and ends with a question, and `/tutor/speak` turns the reply into a Sarvam voice.
No accounts and nothing stored: the conversation lives in the browser. Because anyone can call it,
a daily cap on turns and on spoken replies protects the Claude and Sarvam budgets.
"""

import logging
import tempfile
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Annotated, Literal

import anthropic
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from app.config import settings
from app.voice.sarvam import SarvamTTS
from app.voice.settings import VoiceSettings
from app.voice.tts import TTSError

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/tutor", tags=["tutor"])

MODEL = "claude-haiku-5-5"  # fast and cheap: a spoken turn must come back in about a second
MAX_TURNS = 20  # messages of history sent to Claude
LANGUAGES = {"en": "English", "hi": "Hindi", "ta": "Tamil", "or": "Odia"}

Lang = Literal["en", "hi", "ta", "or"]
Style = Literal["normal", "simple"]


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=1000)


class ChatIn(BaseModel):
    messages: list[Message] = Field(min_length=1, max_length=40)
    language: Lang = "en"
    style: Style = "normal"  # "simple": explain like I am five
    topic: str = Field(default="", max_length=120)


class ChatOut(BaseModel):
    reply: str


class SpeakIn(BaseModel):
    text: str = Field(min_length=1, max_length=600)
    language: Lang = "en"


def system_prompt(language: str, style: str, topic: str) -> str:
    lines = [
        "You are Sahpaathi, a warm, patient one-to-one teacher for a child or an adult learner "
        "in India who has little schooling support. You teach by talking, like a good tutor, "
        "not by lecturing.",
        f"The learner's chosen language is {LANGUAGES[language]}: use it by default. If they "
        "ask to continue in any other language (Hindi, Tamil, Odia, English, ...), switch at "
        "once, keep teaching in that language until they ask again, and never say you can only "
        "use one language. Keep words plain and sentences short: your reply is read aloud.",
        "Each turn: at most 3 short sentences, then ONE small question or task that checks "
        "understanding or invites the learner to try. Never give more than one idea at a time. "
        "No markdown, no bullet points, no emojis, no headings.",
        "Teach step by step. Use everyday things the learner can see or touch (seeds, pebbles, "
        "rotis, coins, buses). If they say they do not understand, do not repeat yourself: try "
        "a different, simpler example. If they answer wrongly, say kindly what is right and why, "
        "then try again. Praise effort briefly, never flattery.",
        "If the learner asks a doubt in the middle, answer it first, then return to the lesson.",
        "Maths must be exactly right: work every sum through step by step before you say it.",
        "Stay a teacher. Decline anything unrelated to learning or unsafe, and never ask for or "
        "keep personal details (school name, address, phone, photos). If a child seems upset or "
        "in danger, tell them gently to talk to a trusted adult such as a parent or teacher.",
    ]
    if style == "simple":
        lines.append(
            "Explain like the learner is five years old with no previous knowledge: one tiny idea "
            "at a time, a concrete picture or story, no jargon, and check after every step."
        )
    if topic:
        lines.append(
            f"The lesson topic is: {topic}. Begin by asking what the learner already knows about "
            "it, then teach it step by step."
        )
    else:
        lines.append(
            "No topic is set yet: greet the learner in one short sentence and ask what they want "
            "to learn today."
        )
    return "\n".join(lines)


_used: dict[tuple[date, str], int] = {}


def _spend(kind: str, limit: int) -> None:
    """Count one call against today's (UTC) cap for `kind`. In memory: a restart resets it, which is
    fine for a single free-tier instance and a demo."""
    today = datetime.now(UTC).date()
    for key in [k for k in _used if k[0] != today]:
        del _used[key]
    if _used.get((today, kind), 0) >= limit:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "The teacher has answered a lot of questions today. Please try again tomorrow.",
        )
    _used[(today, kind)] = _used.get((today, kind), 0) + 1


def get_client() -> anthropic.Anthropic:
    if not settings.anthropic_api_key:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "The tutor is not set up yet.")
    return anthropic.Anthropic(api_key=settings.anthropic_api_key)


def get_voice() -> SarvamTTS | None:
    key = VoiceSettings().tts_api_key
    return SarvamTTS(key) if key else None


@router.post("/chat")
def chat(body: ChatIn, client: Annotated[anthropic.Anthropic, Depends(get_client)]) -> ChatOut:
    if body.messages[-1].role != "user":
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "The last message must be the learner's."
        )
    _spend("chat", settings.tutor_daily_turns)
    history = [m.model_dump() for m in body.messages[-MAX_TURNS:]]
    while (
        history and history[0]["role"] != "user"
    ):  # the API wants the first turn to be the learner's
        history.pop(0)
    try:
        res = client.messages.create(
            model=MODEL,
            max_tokens=600,
            thinking={"type": "disabled"},  # a spoken turn must not wait for hidden reasoning
            system=system_prompt(body.language, body.style, body.topic.strip()),
            messages=history,
        )
    except anthropic.APIError as e:
        log.warning("tutor: Claude call failed: %s", e)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, "The teacher could not answer. Try again."
        ) from e
    reply = "".join(b.text for b in res.content if b.type == "text").strip()
    if not reply:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, "The teacher gave an empty answer. Try again."
        )
    return ChatOut(reply=reply)


@router.post("/speak")
def speak(body: SpeakIn, voice: Annotated[SarvamTTS | None, Depends(get_voice)]) -> Response:
    """The reply as a Sarvam voice (WAV). 503 means "no voice here": the app speaks it itself."""
    if voice is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "No server voice is set up.")
    _spend("speak", settings.tutor_daily_voice)
    with tempfile.TemporaryDirectory() as tmp:
        try:
            wav = voice.synthesize(body.text, body.language, "guide", Path(tmp) / "reply.wav")
        except TTSError as e:
            log.warning("tutor: voice failed: %s", e)
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The voice is busy. Try again.") from e
        return Response(
            wav.read_bytes(), media_type="audio/wav", headers={"Cache-Control": "no-store"}
        )
