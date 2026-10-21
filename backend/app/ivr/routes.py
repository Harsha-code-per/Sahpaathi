"""Absentee catch-up calls: a queue, and the endpoints that drive one call step by step.

The keypad simulator in the Admin screens calls these directly; a phone provider's webhook will
call the same `start` and `press` logic. Every step is saved, so a call can be inspected later.
"""

from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, computed_field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import db as database
from app.auth import require
from app.ivr import flow
from app.models import CatchupCall, EpisodeRecord, PackRecord, User
from app.sync import SAMPLE_PREFIX, Ref

router = APIRouter(prefix="/api/v1/ivr", tags=["ivr"])
Admin = Annotated[User, Depends(require("admin"))]
DB = Annotated[Session, Depends(database.get_db)]

SLUG = r"^[a-z0-9][a-z0-9-]*$"
Digit = Literal["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "#"]


class CallIn(BaseModel):
    classroom_id: Ref
    student_ref: Ref
    episode_slug: str = Field(max_length=100, pattern=SLUG)


class CallOut(BaseModel):
    id: int
    classroom_id: str
    student_ref: str
    episode_slug: str
    status: str
    outcome: str | None
    plays: int
    created_at: datetime

    @computed_field
    @property
    def sample(self) -> bool:
        """A call to a SAMPLE classroom (app/sample_data.py): shown with a label, never dialled."""
        return self.classroom_id.startswith(SAMPLE_PREFIX)


class AudioRef(BaseModel):
    name: str  # "recap" or "menu"
    url: str  # fetch with the admin token


class StepOut(BaseModel):
    play: list[AudioRef]
    gather: bool  # wait for one keypad digit after playing
    hangup: bool
    status: str
    outcome: str | None


class PressIn(BaseModel):
    digit: Digit | None = None  # None: the parent pressed nothing in time


def _out(call: CatchupCall) -> CallOut:
    return CallOut.model_validate(call, from_attributes=True)


def _get(db: Session, call_id: int) -> CatchupCall:
    call = db.get(CatchupCall, call_id)
    if call is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such call.")
    return call


def find_pack(db: Session, episode_slug: str) -> PackRecord | None:
    """The newest ready pack, with call audio, of the approved episode called `episode_slug`."""
    approved = db.scalars(
        select(EpisodeRecord)
        .where(EpisodeRecord.status == "approved")
        .order_by(EpisodeRecord.id.desc())
    )
    ids = [r.id for r in approved if r.episode and r.episode.get("id") == episode_slug]
    if not ids:
        return None
    return db.scalars(
        select(PackRecord)
        .where(
            PackRecord.episode_id.in_(ids),
            PackRecord.status == "ready",
            PackRecord.recap.is_not(None),  # packs built before the call audio existed lack it
            PackRecord.menu.is_not(None),
        )
        .order_by(PackRecord.id.desc())
    ).first()


def _step(call: CatchupCall, step: flow.Step) -> StepOut:
    base = f"/api/v1/packs/{call.pack_id}/ivr"
    return StepOut(
        play=[AudioRef(name=n, url=f"{base}/{n}") for n in step.play],
        gather=step.gather,
        hangup=step.hangup,
        status=call.status,
        outcome=call.outcome,
    )


@router.get("/calls")
def list_calls(_: Admin, db: DB) -> list[CallOut]:
    return [_out(c) for c in db.scalars(select(CatchupCall).order_by(CatchupCall.id.desc()))]


@router.post("/calls")
def queue_call(body: CallIn, _: Admin, db: DB) -> CallOut:
    """Queue the catch-up call for one absent child. Asking again for the same child and episode
    returns the existing call, so a repeated attendance sync never calls a family twice."""
    existing = db.scalar(
        select(CatchupCall).where(
            CatchupCall.classroom_id == body.classroom_id,
            CatchupCall.student_ref == body.student_ref,
            CatchupCall.episode_slug == body.episode_slug,
        )
    )
    if existing:
        return _out(existing)
    call = CatchupCall(**body.model_dump())
    db.add(call)
    db.commit()
    return _out(call)


def begin(db: Session, call_id: int) -> tuple[CatchupCall, flow.Step]:
    """Moves a queued call to in progress on its newest ready pack; the simulator and Exotel both
    start calls here."""
    call = _get(db, call_id)
    if call.status != "queued":
        raise HTTPException(status.HTTP_409_CONFLICT, f"This call is {call.status}, not queued.")
    pack = find_pack(db, call.episode_slug)
    if pack is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "No ready pack with call audio for this episode. Build its pack again, then retry.",
        )
    step, progress = flow.start()
    call.status, call.pack_id = "in_progress", pack.id
    call.plays, call.missed = progress.plays, progress.missed
    db.commit()
    return call, step


@router.post("/calls/{call_id}/start")
def start_call(call_id: int, _: Admin, db: DB) -> StepOut:
    return _step(*begin(db, call_id))


@router.post("/calls/{call_id}/press")
def press_key(call_id: int, body: PressIn, _: Admin, db: DB) -> StepOut:
    call = _get(db, call_id)
    if call.status != "in_progress":
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"This call is {call.status}, not in progress."
        )
    step, progress = flow.press(body.digit, flow.Progress(call.plays, call.missed))
    call.plays, call.missed = progress.plays, progress.missed
    if step.hangup:
        call.status = "completed" if step.outcome else "no_response"
        call.outcome = step.outcome
    db.commit()
    return _step(call, step)
