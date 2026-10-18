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
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app import db as database
from app.models import SyncEvent

router = APIRouter(prefix="/api/v1", tags=["sync"])
DB = Annotated[Session, Depends(database.get_db)]

MAX_EVENTS = 200  # the player sends 100 at a time
SLUG = re.compile(r"^[a-z0-9][a-z0-9-]*$")


class TapIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["tap"]
    event_id: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9-]+$")
    episode_id: str = Field(max_length=100, pattern=SLUG.pattern)
    segment_id: str = Field(max_length=100, pattern=SLUG.pattern)
    tap: Literal["few", "some", "most"]
    auto: bool
    at: datetime  # ISO 8601 with a timezone


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
    where = ".".join(str(p) for p in first["loc"]) or "event"
    return f"{where}: {first['msg']}"


def _insert_ignoring_duplicates(db: Session, rows: list[dict]) -> None:
    """INSERT ... ON CONFLICT DO NOTHING, so two phones retrying at once cannot collide."""
    insert = pg_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert
    db.execute(insert(SyncEvent).values(rows).on_conflict_do_nothing(index_elements=["event_id"]))


@router.post("/sync")
def sync(body: SyncIn, db: DB) -> SyncOut:
    good: dict[str, dict] = {}
    rejected: list[Rejected] = []
    for raw in body.events:
        try:
            tap = TapIn.model_validate(raw)
        except ValidationError as e:
            event_id = raw.get("event_id")
            rejected.append(
                Rejected(
                    event_id=event_id if isinstance(event_id, str) else None, reason=_reason(e)
                )
            )
            continue
        if tap.at.tzinfo is None:
            rejected.append(Rejected(event_id=tap.event_id, reason="at: needs a timezone"))
            continue
        good[tap.event_id] = tap.model_dump(exclude={"kind"})

    already = set(db.scalars(select(SyncEvent.event_id).where(SyncEvent.event_id.in_(good))))
    fresh = [row for event_id, row in good.items() if event_id not in already]
    if fresh:
        _insert_ignoring_duplicates(db, fresh)
        db.commit()
    # Repeats inside one batch collapse into one stored row, so they count as duplicates too.
    return SyncOut(
        accepted=len(fresh),
        duplicates=len(body.events) - len(rejected) - len(fresh),
        rejected=rejected,
    )
