"""Shapes shared by the tutor's engine, its Claude brain and the API."""

from typing import Literal

from pydantic import BaseModel, Field

Lang = Literal["en", "hi", "ta", "or"]
Style = Literal["normal", "simple"]  # "simple": explain like I am five
LANGUAGES = {"en": "English", "hi": "Hindi", "ta": "Tamil", "or": "Odia"}

Intent = Literal["answer", "doubt", "again", "ready", "skip", "stop", "other"]
Verdict = Literal["correct", "partly", "wrong"]


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class Question(BaseModel):
    ask: str = Field(max_length=400)
    answer: str = Field(max_length=300)  # the reference answer the judge compares with
    hint: str = Field(max_length=300)


class Part(BaseModel):
    """One concept, small enough to teach in a few minutes and then check."""

    title: str = Field(max_length=120)
    points: list[str] = Field(min_length=1, max_length=5)  # the ideas to teach, in order
    example: str = Field(max_length=400)  # an everyday example
    minutes: int = Field(ge=1, le=15)
    quiz: list[Question] = Field(min_length=1, max_length=3)


class Plan(BaseModel):
    title: str = Field(max_length=160)
    language: Lang = "en"  # the language the questions are written in (set by the server)
    parts: list[Part] = Field(min_length=1, max_length=6)

    def total_minutes(self) -> int:
        return sum(p.minutes for p in self.parts)


class Progress(BaseModel):
    """Where the lesson is. The browser keeps it and sends it back each turn; the engine moves it."""

    mode: Literal["chat", "teach", "quiz", "done"] = "chat"
    part: int = Field(default=0, ge=0, le=5)
    q: int = Field(default=0, ge=0, le=2)  # question being asked in `part`
    misses: int = Field(default=0, ge=0, le=3)  # wrong answers on that question
    correct: int = Field(default=0, ge=0, le=100)  # questions passed
    revealed: list[str] = Field(default_factory=list, max_length=20)  # answers we had to give away


class Judgement(BaseModel):
    """What the student just said, read by the model but acted on by the engine."""

    intent: Intent
    verdict: Verdict | None = None  # only when intent is "answer"
    language: Lang | None = None  # the student asked to switch language
    style: Style | None = None  # the student asked for simpler ("like I am five") or normal


class ChatResult(BaseModel):
    reply: str
    study_topic: str | None = None  # set when the student asks to learn something


class Document(BaseModel):
    name: str = Field(max_length=200)
    media_type: Literal["application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain"]
    data: str = Field(max_length=7_000_000)  # base64; plain text is sent as text/plain base64 too


class PlanIn(BaseModel):
    topic: str = Field(default="", max_length=400)
    document: Document | None = None
    language: Lang = "en"
    style: Style = "normal"


class TurnIn(BaseModel):
    messages: list[Message] = Field(
        default_factory=list, max_length=40
    )  # earlier turns, oldest first
    text: str = Field(default="", max_length=1000)  # what the student just said; empty with `begin`
    begin: bool = False  # start teaching part 1 of a freshly made plan
    plan: Plan | None = None
    progress: Progress = Field(default_factory=Progress)
    language: Lang = "en"
    style: Style = "normal"


class TurnOut(BaseModel):
    reply: str
    progress: Progress
    language: Lang
    style: Style
    start_study: str | None = None  # a topic: the app should now ask for a plan
    intent: Intent | None = None


class SpeakIn(BaseModel):
    text: str = Field(min_length=1, max_length=600)
    language: Lang = "en"
