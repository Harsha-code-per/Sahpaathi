"""GET /api/v1/insights: what a block or cluster resource person wants to know.

Which classes are doing well and which need support, which part of which lesson loses children, how
the weeks compare, and what teachers say about the lessons. Everything is an aggregate over opaque
classroom codes: no names, no phone numbers. "Sample" rows (app/sample_data.py) are labelled and can
be filtered out.
"""

from collections import Counter, defaultdict
from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import db as database
from app import sample_data
from app.auth import require
from app.models import CatchupCall, LessonFeedback, SyncEvent, User

router = APIRouter(prefix="/api/v1", tags=["insights"])
Admin = Annotated[User, Depends(require("admin"))]
DB = Annotated[Session, Depends(database.get_db)]
Data = Literal["all", "real", "sample"]

WEEKS = 8
MIN_TAPS = 8  # fewer deliberate taps than this and a percentage means nothing


def tap_filter(data: Data):
    mark = SyncEvent.event_id.like(f"{sample_data.PREFIX}%")
    return {"sample": mark, "real": ~mark}.get(data)


def call_filter(data: Data):
    mark = CatchupCall.classroom_id.like(f"{sample_data.PREFIX}%")
    return {"sample": mark, "real": ~mark}.get(data)


def feedback_filter(data: Data):
    mark = LessonFeedback.event_id.like(f"{sample_data.PREFIX}%")
    return {"sample": mark, "real": ~mark}.get(data)


def pct(n: int, total: int) -> float | None:
    return round(100 * n / total, 1) if total >= 1 else None


class Mix(BaseModel):
    taps: int  # deliberate taps
    pct_most: float | None
    pct_some: float | None
    pct_few: float | None


class SegmentStat(Mix):
    episode_id: str
    segment_id: str
    auto: int


class ClassroomStat(Mix):
    classroom_id: str
    sample: bool
    lesson_days: int
    episodes: list[str]
    last_active: str | None
    calls: int
    calls_answered: int
    calls_help: int
    avg_rating: float | None
    status: Literal["doing well", "watch", "needs support", "not enough taps yet"]


class Week(BaseModel):
    week_start: str
    taps: int
    classrooms: int
    pct_most: float | None
    pct_few: float | None


class FeedbackSummary(BaseModel):
    count: int
    avg_rating: float | None
    ratings: dict[str, int]  # "1".."5" -> how many
    tags: dict[str, int]
    by_episode: dict[str, float]  # episode -> average rating


class SampleInfo(BaseModel):
    taps: int
    calls: int
    feedback: int


class Insights(BaseModel):
    data: Data
    totals: dict[str, int]
    weeks: list[Week]
    hardest_parts: list[SegmentStat]
    segments: list[SegmentStat]
    classrooms: list[ClassroomStat]
    feedback: FeedbackSummary
    sample: SampleInfo


def _mix(c: Counter) -> dict:
    total = c["most"] + c["some"] + c["few"]
    return {
        "taps": total,
        "pct_most": pct(c["most"], total),
        "pct_some": pct(c["some"], total),
        "pct_few": pct(c["few"], total),
    }


def _aware(at: datetime) -> datetime:
    return at if at.tzinfo else at.replace(tzinfo=UTC)  # SQLite hands times back without their zone


def _status(mix: dict, last: datetime | None, today: date) -> str:
    if mix["taps"] < MIN_TAPS:
        return "not enough taps yet"
    if mix["pct_few"] >= 35:
        return "needs support"
    if mix["pct_few"] >= 25 or (last and (today - last.date()).days > 14):
        return "watch"
    return "doing well"


@router.get("/insights")
def insights(_: Admin, db: DB, data: Data = "all") -> Insights:
    today = datetime.now(UTC).date()
    q = select(
        SyncEvent.episode_id,
        SyncEvent.segment_id,
        SyncEvent.tap,
        SyncEvent.auto,
        SyncEvent.at,
        SyncEvent.classroom_id,
    )
    if (cond := tap_filter(data)) is not None:
        q = q.where(cond)
    rows = db.execute(q).all()

    per_segment: dict[tuple[str, str], Counter] = defaultdict(Counter)
    per_class: dict[str, Counter] = defaultdict(Counter)
    class_days: dict[str, set] = defaultdict(set)
    class_eps: dict[str, set] = defaultdict(set)
    class_last: dict[str, datetime] = {}
    autos: Counter = Counter()
    monday = today - timedelta(days=today.weekday())
    starts = [monday - timedelta(weeks=WEEKS - 1 - i) for i in range(WEEKS)]
    per_week: dict[date, Counter] = {s: Counter() for s in starts}
    week_classes: dict[date, set] = {s: set() for s in starts}
    overall: Counter = Counter()
    for episode, segment, tap, auto, at, classroom in rows:
        at = _aware(at)
        if auto:
            autos[(episode, segment)] += 1
        else:
            per_segment[(episode, segment)][tap] += 1
            overall[tap] += 1
            if classroom:
                per_class[classroom][tap] += 1
            wk = at.date() - timedelta(days=at.weekday())
            if wk in per_week:
                per_week[wk][tap] += 1
        if classroom:
            class_days[classroom].add(at.date())
            class_eps[classroom].add(episode)
            class_last[classroom] = max(class_last.get(classroom, at), at)
            wk = at.date() - timedelta(days=at.weekday())
            if wk in week_classes:
                week_classes[wk].add(classroom)
        per_segment.setdefault((episode, segment), Counter())

    calls: dict[str, Counter] = defaultdict(Counter)
    cq = select(CatchupCall.classroom_id, CatchupCall.status, CatchupCall.outcome)
    if (cond := call_filter(data)) is not None:
        cq = cq.where(cond)
    for classroom, call_status, outcome in db.execute(cq):
        calls[classroom]["total"] += 1
        if call_status == "completed":
            calls[classroom]["answered"] += 1
        if outcome == "help":
            calls[classroom]["help"] += 1

    fq = select(
        LessonFeedback.episode_id,
        LessonFeedback.classroom_id,
        LessonFeedback.rating,
        LessonFeedback.tags,
    )
    if (cond := feedback_filter(data)) is not None:
        fq = fq.where(cond)
    ratings: Counter = Counter()
    tags: Counter = Counter()
    by_episode: dict[str, list[int]] = defaultdict(list)
    class_ratings: dict[str, list[int]] = defaultdict(list)
    for episode, classroom, rating, tag_list in db.execute(fq):
        ratings[str(rating)] += 1
        by_episode[episode].append(rating)
        if classroom:
            class_ratings[classroom].append(rating)
        tags.update(tag_list or [])
    n_feedback = sum(ratings.values())

    segments = [
        SegmentStat(episode_id=e, segment_id=s, auto=autos[(e, s)], **_mix(c))
        for (e, s), c in sorted(per_segment.items())
    ]
    hardest = sorted((s for s in segments if s.taps >= MIN_TAPS), key=lambda s: -(s.pct_few or 0))[
        :6
    ]

    classrooms = []
    for code in sorted(set(per_class) | set(class_days) | set(calls)):
        mix = _mix(per_class[code]) if code in per_class else _mix(Counter())
        last = class_last.get(code)
        c = calls.get(code, Counter())
        rs = class_ratings.get(code)
        classrooms.append(
            ClassroomStat(
                classroom_id=code,
                sample=code.startswith(sample_data.PREFIX),
                lesson_days=len(class_days.get(code, ())),
                episodes=sorted(class_eps.get(code, ())),
                last_active=last.date().isoformat() if last else None,
                calls=c["total"],
                calls_answered=c["answered"],
                calls_help=c["help"],
                avg_rating=round(sum(rs) / len(rs), 2) if rs else None,
                status=_status(mix, last, today),
                **mix,
            )
        )
    order = {"needs support": 0, "watch": 1, "doing well": 2, "not enough taps yet": 3}
    classrooms.sort(key=lambda c: (order[c.status], c.classroom_id))

    return Insights(
        data=data,
        totals={
            "taps": sum(overall.values()),
            "auto_taps": sum(autos.values()),
            "classrooms": len([c for c in classrooms if c.lesson_days]),
            "lessons_played": sum(len(d) for d in class_days.values()),
            "episodes": len({e for e, _s in per_segment}),
            "calls": sum(c["total"] for c in calls.values()),
            "feedback": n_feedback,
        },
        weeks=[
            Week(
                week_start=s.isoformat(),
                taps=sum(per_week[s].values()),
                classrooms=len(week_classes[s]),
                pct_most=_mix(per_week[s])["pct_most"],
                pct_few=_mix(per_week[s])["pct_few"],
            )
            for s in starts
        ],
        hardest_parts=hardest,
        segments=segments,
        classrooms=classrooms,
        feedback=FeedbackSummary(
            count=n_feedback,
            avg_rating=round(sum(int(k) * v for k, v in ratings.items()) / n_feedback, 2)
            if n_feedback
            else None,
            ratings={str(i): ratings[str(i)] for i in range(1, 6)},
            tags=dict(tags.most_common()),
            by_episode={e: round(sum(v) / len(v), 2) for e, v in sorted(by_episode.items())},
        ),
        sample=SampleInfo(**sample_data.counts(db)),
    )


class SampleCounts(BaseModel):
    taps: int
    calls: int
    feedback: int


@router.post("/insights/sample-data", status_code=status.HTTP_201_CREATED)
def load_sample_data(_: Admin, db: DB) -> SampleCounts:
    """Fills the dashboard with labelled SAMPLE classrooms (replacing any earlier sample set)."""
    return SampleCounts(**sample_data.load(db))


@router.delete("/insights/sample-data")
def remove_sample_data(_: Admin, db: DB) -> SampleCounts:
    sample_data.remove(db)
    return SampleCounts(**sample_data.counts(db))
