"""POST /api/v1/sync: the player uploads its outbox of checkpoint taps whenever it finds signal.

Rules that keep a 2G classroom queue draining (docs/API.md):
- Idempotent by `event_id`: a retried or repeated event is counted once and still answered 2xx.
- One bad event never fails the batch. The player deletes a batch after any 2xx, so a 4xx would
  keep a poison event at the head of its queue forever. Bad events are reported back instead.
- The player has no login yet, so this endpoint is open. It carries no personal data (episode,
  segment, tap), is size-capped, and validates every field. ponytail: add a device token when
  the teacher login lands.
"""

import re
from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app import db as database
from app.models import CatchupCall, SyncEvent

router = APIRouter(prefix="/api/v1", tags=["sync"])
DB = Annotated[Session, Depends(database.get_db)]

MAX_EVENTS = 200  # the player sends 100 at a time
SLUG = re.compile(r"^[a-z0-9][a-z0-9-]*$")
REF = r"^[A-Za-z0-9][A-Za-z0-9-]{0,39}$"  # a classroom code or roll number, never a name


class TapIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["tap"]
    event_id: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9-]+$")
    episode_id: str = Field(max_length=100, pattern=SLUG.pattern)
    segment_id: str = Field(max_length=100, pattern=SLUG.pattern)
    tap: Literal["few", "some", "most"]
    auto: bool
    at: datetime  # ISO 8601 with a timezone


class AttendanceIn(BaseModel):
    """Who was absent from an episode. Children are opaque roll numbers inside a classroom code:
    no names, no phone numbers. Each absent child gets one catch-up call (app/ivr)."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["attendance"]
    event_id: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9-]+$")
    classroom_id: str = Field(pattern=REF)
    episode_id: str = Field(max_length=100, pattern=SLUG.pattern)
    absent: list[Annotated[str, Field(pattern=REF)]] = Field(max_length=100)
    at: datetime


EVENT = TypeAdapter(Annotated[TapIn | AttendanceIn, Field(discriminator="kind")])


class SyncIn(BaseModel):
    events: list[dict[str, Any]] = Field(max_length=MAX_EVENTS)


class Rejected(BaseModel):
    event_id: str | None
    reason: str


class SyncOut(BaseModel):
    accepted: int  # new events stored
    duplicates: int  # already stored: safe to delete from the queue
    rejected: list[Rejected]  # unusable events: also safe to delete, they can never succeed


def _reason(e: ValidationError) -> str:
    first = e.errors()[0]
    if first["type"] in ("union_tag_invalid", "union_tag_not_found"):
        return "kind: must be tap or attendance"
    loc = first["loc"][1:] if first["loc"][:1] in (("tap",), ("attendance",)) else first["loc"]
    return f"{'.'.join(str(p) for p in loc) or 'event'}: {first['msg']}"


def _insert_ignoring_duplicates(db: Session, model, rows: list[dict], key: list[str]) -> int:
    """INSERT ... ON CONFLICT DO NOTHING, so two phones retrying at once cannot collide.
    Returns how many rows were new."""
    insert = pg_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert
    stmt = insert(model).values(rows).on_conflict_do_nothing(index_elements=key)
    # RETURNING lists only the rows really inserted. `rowcount` cannot be used: Postgres reports -1.
    return len(db.execute(stmt.returning(getattr(model, key[0]))).all())


@router.post("/sync")
def sync(body: SyncIn, db: DB) -> SyncOut:
    taps: dict[str, dict] = {}
    attendance: dict[str, AttendanceIn] = {}
    rejected: list[Rejected] = []
    for raw in body.events:
        try:
            event = EVENT.validate_python(raw)
        except ValidationError as e:
            event_id = raw.get("event_id")
            rejected.append(
                Rejected(
                    event_id=event_id if isinstance(event_id, str) else None, reason=_reason(e)
                )
            )
            continue
        if event.at.tzinfo is None:
            rejected.append(Rejected(event_id=event.event_id, reason="at: needs a timezone"))
            continue
        if isinstance(event, TapIn):
            taps[event.event_id] = event.model_dump(exclude={"kind"})
        else:
            attendance[event.event_id] = event

    already = set(db.scalars(select(SyncEvent.event_id).where(SyncEvent.event_id.in_(taps))))
    fresh = [row for event_id, row in taps.items() if event_id not in already]
    accepted = _insert_ignoring_duplicates(db, SyncEvent, fresh, ["event_id"]) if fresh else 0
    for event in attendance.values():
        # Attendance is idempotent through the call itself: one per child and episode.
        absent = sorted(set(event.absent))
        calls = [
            {
                "classroom_id": event.classroom_id,
                "student_ref": ref,
                "episode_slug": event.episode_id,
            }
            for ref in absent
        ]
        new = (
            _insert_ignoring_duplicates(
                db, CatchupCall, calls, ["classroom_id", "student_ref", "episode_slug"]
            )
            if calls
            else 0
        )
        accepted += 1 if (new or not calls) else 0
    db.commit()
    # Repeats inside one batch collapse into one stored row, so they count as duplicates too.
    return SyncOut(
        accepted=accepted,
        duplicates=len(body.events) - len(rejected) - accepted,
        rejected=rejected,
    )
