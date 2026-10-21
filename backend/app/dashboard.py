"""GET /api/v1/dashboard: what the CRP dashboard shows, computed from the synced taps.

"Most / Some / Few got it" percentages count deliberate taps only. When nobody tapped, the player's
10 s fallback chose Core for the teacher, so that is reported separately as `auto_fallbacks`.
"""

from collections import Counter
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import db as database
from app.auth import require
from app.models import CatchupCall, EpisodeRecord, PackRecord, SyncEvent, User
from app.sample_data import PREFIX

router = APIRouter(prefix="/api/v1", tags=["dashboard"])
Admin = Annotated[User, Depends(require("admin"))]
DB = Annotated[Session, Depends(database.get_db)]

DAYS = 14
Data = Literal["all", "real", "sample"]  # sample rows are invented and labelled: app/sample_data.py


def _taps(data: Data):
    mark = SyncEvent.event_id.like(f"{PREFIX}%")
    return {"sample": mark, "real": ~mark}.get(data)


def _calls(data: Data):
    mark = CatchupCall.classroom_id.like(f"{PREFIX}%")
    return {"sample": mark, "real": ~mark}.get(data)


class Understanding(BaseModel):
    taps: int  # deliberate taps
    most: int
    some: int
    few: int
    pct_most: float | None  # None until there is a deliberate tap
    pct_some: float | None
    pct_few: float | None


class EpisodeUsage(Understanding):
    episode_id: str
    auto_fallbacks: int


class Day(BaseModel):
    date: str
    taps: int


class CatchupStats(BaseModel):
    total: int
    queued: int
    in_progress: int
    completed: int  # a parent pressed 2 or 3
    no_response: int  # the call ended with no answer
    understood: int  # pressed 2
    help: int  # pressed 3: the teacher should follow up
    pct_answered: float | None  # completed of the finished calls; None until one has finished


class Dashboard(BaseModel):
    overall: Understanding
    auto_fallbacks: int
    episodes: list[EpisodeUsage]
    last_days: list[Day]  # DAYS days ending today (UTC), oldest first, zeros included
    episodes_by_status: dict[str, int]
    packs_ready: int
    catchup_calls: CatchupStats
    data: Data = "all"
    sample_taps: int = 0  # how many of all the taps are invented sample data
    sample_calls: int = 0


def _catchup(db: Session, data: Data = "all") -> CatchupStats:
    cond = _calls(data)
    status_q = select(CatchupCall.status, func.count()).group_by(CatchupCall.status)
    outcome_q = (
        select(CatchupCall.outcome, func.count())
        .where(CatchupCall.outcome.is_not(None))
        .group_by(CatchupCall.outcome)
    )
    if cond is not None:
        status_q, outcome_q = status_q.where(cond), outcome_q.where(cond)
    by_status = dict(db.execute(status_q).all())
    outcomes = dict(db.execute(outcome_q).all())
    done = by_status.get("completed", 0) + by_status.get("no_response", 0)
    return CatchupStats(
        total=sum(by_status.values()),
        queued=by_status.get("queued", 0),
        in_progress=by_status.get("in_progress", 0),
        completed=by_status.get("completed", 0),
        no_response=by_status.get("no_response", 0),
        understood=outcomes.get("understood", 0),
        help=outcomes.get("help", 0),
        pct_answered=round(100 * by_status.get("completed", 0) / done, 1) if done else None,
    )


def _understanding(c: Counter) -> Understanding:
    total = c["most"] + c["some"] + c["few"]

    def pct(n: int) -> float | None:
        return round(100 * n / total, 1) if total else None

    return Understanding(
        taps=total,
        most=c["most"],
        some=c["some"],
        few=c["few"],
        pct_most=pct(c["most"]),
        pct_some=pct(c["some"]),
        pct_few=pct(c["few"]),
    )


@router.get("/dashboard")
def dashboard(_: Admin, db: DB, data: Data = "all") -> Dashboard:
    cond = _taps(data)
    q = (
        select(SyncEvent.episode_id, SyncEvent.tap, SyncEvent.auto, func.count())
        .group_by(SyncEvent.episode_id, SyncEvent.tap, SyncEvent.auto)
        .order_by(SyncEvent.episode_id)
    )
    rows = db.execute(q.where(cond) if cond is not None else q)
    overall: Counter = Counter()
    per_episode: dict[str, Counter] = {}
    autos: Counter = Counter()
    for episode_id, tap, auto, n in rows:
        if auto:
            autos[episode_id] += n
            per_episode.setdefault(episode_id, Counter())
        else:
            overall[tap] += n
            per_episode.setdefault(episode_id, Counter())[tap] += n

    today = datetime.now(UTC).date()
    start = today - timedelta(days=DAYS - 1)
    per_day: Counter = Counter()
    cutoff = datetime(start.year, start.month, start.day, tzinfo=UTC)
    day_q = select(SyncEvent.at).where(SyncEvent.at >= cutoff)
    for (at,) in db.execute(day_q.where(cond) if cond is not None else day_q):
        # SQLite hands the time back without its zone; astimezone() would then read it as the
        # server's local time and move early-morning UTC taps to the day before.
        per_day[(at if at.tzinfo else at.replace(tzinfo=UTC)).astimezone(UTC).date()] += 1

    return Dashboard(
        overall=_understanding(overall),
        auto_fallbacks=sum(autos.values()),
        episodes=[
            EpisodeUsage(**_understanding(c).model_dump(), episode_id=e, auto_fallbacks=autos[e])
            for e, c in per_episode.items()
        ],
        last_days=[
            Day(date=(d := start + timedelta(days=i)).isoformat(), taps=per_day[d])
            for i in range(DAYS)
        ],
        episodes_by_status=dict(
            db.execute(
                select(EpisodeRecord.status, func.count()).group_by(EpisodeRecord.status)
            ).all()
        ),
        packs_ready=db.scalar(select(func.count()).where(PackRecord.status == "ready")) or 0,
        catchup_calls=_catchup(db, data),
        data=data,
        sample_taps=db.scalar(select(func.count()).where(_taps("sample"))) or 0,
        sample_calls=db.scalar(select(func.count()).where(_calls("sample"))) or 0,
    )
