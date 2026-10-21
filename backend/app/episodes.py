"""Studio API: generate an episode in the background, list episodes, record the reviewer's decision.

Generation takes minutes (Sonnet writes, Haiku reviews, maybe one repair), so POST returns at once
with status "generating" and the Studio polls. ponytail: in-process BackgroundTasks on one
instance; move to a job queue if we ever run more than one backend instance.
"""

import logging
from datetime import UTC, datetime, time
from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app import db as database
from app.auth import require
from app.config import settings
from app.factory import judge, rules, scriptwriter
from app.factory.schema import Episode
from app.factory.scriptwriter import District, Lesson
from app.models import EpisodeRecord, SyncEvent, User
from app.voice.splicer import load_phrasebank

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["studio"])
Reviewer = Annotated[User, Depends(require("reviewer", "admin"))]
DB = Annotated[Session, Depends(database.get_db)]


def lessons() -> dict[str, Lesson]:
    files = sorted((settings.content_dir / "curriculum").glob("*.json"))
    return {f.stem: Lesson.model_validate_json(f.read_text()) for f in files}


def districts() -> dict[str, District]:
    files = sorted((settings.content_dir / "districts").glob("*.json"))
    return {f.stem: District.model_validate_json(f.read_text()) for f in files}


def santali_bank() -> list[str]:
    """The scriptwriter may only use recorded Santali phrases (each with a consent reference)."""
    return [p.text for p in load_phrasebank(settings.content_dir / "voices/santali")]


def run_generation(record_id: int) -> None:
    with database.SessionLocal() as db:
        rec = db.get(EpisodeRecord, record_id)
        try:
            district = districts()[rec.district_id]
            bank = santali_bank() if district.home_lang == "sat" else None
            episode, review = judge.generate(lessons()[rec.lesson_id], district, bank)
        except Exception as e:  # any failure must end the job, or it shows "generating" forever
            log.exception("generation %s failed", record_id)
            rec.status, rec.error = "failed", f"{type(e).__name__}: {e}"[:2000]
        else:
            rec.status = "in_review"
            rec.episode, rec.review = episode.model_dump(), review.model_dump()
        db.commit()


def fail_orphans(db: Session) -> None:
    """At startup: jobs that were 'generating' died with the previous process."""
    db.execute(
        update(EpisodeRecord)
        .where(EpisodeRecord.status == "generating")
        .values(status="failed", error="The server restarted during generation. Generate again.")
    )
    db.commit()


class CatalogLesson(BaseModel):
    id: str
    grade: int
    subject: str
    chapter: str
    nipun_lo: str


class CatalogDistrict(BaseModel):
    id: str
    name: str
    state: str
    home_lang: str
    school_lang: str


class Catalog(BaseModel):
    lessons: list[CatalogLesson]
    districts: list[CatalogDistrict]


class Summary(BaseModel):
    id: int
    lesson_id: str
    district_id: str
    status: str
    title: str | None
    passed: bool | None  # the Haiku review's verdict; the reviewer still decides
    scores: dict[str, int] | None
    error: str | None
    created_at: datetime


class Detail(Summary):
    episode: dict | None
    review: dict | None
    review_notes: str | None
    reviewed_by: str | None
    edits: dict | None  # line id -> {before, by, at}: what a reviewer corrected


def _summary(rec: EpisodeRecord) -> dict:
    review = judge.Review.model_validate(rec.review) if rec.review else None
    return {
        "id": rec.id,
        "lesson_id": rec.lesson_id,
        "district_id": rec.district_id,
        "status": rec.status,
        "title": rec.episode["title"] if rec.episode else None,
        "passed": review.passed if review else None,
        "scores": {c: s.score for c, s in review.rubric.scores} if review else None,
        "error": rec.error,
        "created_at": rec.created_at,
    }


def _get(db: Session, episode_id: int) -> EpisodeRecord:
    rec = db.get(EpisodeRecord, episode_id)
    if rec is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such episode.")
    return rec


@router.get("/catalog")
def catalog(_: Reviewer) -> Catalog:
    return Catalog(
        lessons=[CatalogLesson(**{**ls.model_dump(), "id": k}) for k, ls in lessons().items()],
        districts=[CatalogDistrict(**d.model_dump()) for d in districts().values()],
    )


class GenerateIn(BaseModel):
    lesson_id: str
    district_id: str


def _check_daily_limit(db: Session) -> None:
    """New lessons and rewrites both cost Claude credits; stop at the day's limit (UTC)."""
    today = datetime.combine(datetime.now(UTC).date(), time(), UTC)
    written = db.scalar(
        select(func.count())
        .select_from(EpisodeRecord)
        .where(EpisodeRecord.source == "factory", EpisodeRecord.created_at >= today)
    )
    if written >= settings.generate_daily_limit:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Today's limit of {settings.generate_daily_limit} new lessons is reached. "
            "Review the ones waiting, or write more tomorrow.",
        )


@router.post("/episodes", status_code=status.HTTP_202_ACCEPTED)
def generate(body: GenerateIn, user: Reviewer, db: DB, tasks: BackgroundTasks) -> Summary:
    if body.lesson_id not in lessons() or body.district_id not in districts():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown lesson or district.")
    _check_daily_limit(db)
    rec = EpisodeRecord(
        lesson_id=body.lesson_id, district_id=body.district_id, created_by_id=user.id
    )
    db.add(rec)
    db.commit()
    tasks.add_task(run_generation, rec.id)
    return Summary(**_summary(rec))


@router.get("/episodes")
def list_episodes(_: Reviewer, db: DB) -> list[Summary]:
    recs = db.scalars(select(EpisodeRecord).order_by(EpisodeRecord.id.desc()))
    return [Summary(**_summary(r)) for r in recs]


@router.get("/episodes/{episode_id}")
def get_episode(episode_id: int, _: Reviewer, db: DB) -> Detail:
    rec = _get(db, episode_id)
    reviewer = db.get(User, rec.reviewed_by_id) if rec.reviewed_by_id else None
    return Detail(
        **_summary(rec),
        episode=rec.episode,
        review=rec.review,
        review_notes=rec.review_notes,
        reviewed_by=reviewer.name if reviewer else None,
        edits=rec.edits,
    )


class LineEditIn(BaseModel):
    text: str = Field(max_length=2000)


@router.patch("/episodes/{episode_id}/lines/{line_id}")
def edit_line(episode_id: int, line_id: str, body: LineEditIn, user: Reviewer, db: DB) -> Detail:
    """A reviewer corrects one line's wording. The AI's original is kept in `edits`, the code
    checks run again, and the English gloss of that line is now out of date (the Studio says so)."""
    rec = _get(db, episode_id)
    if rec.status != "in_review":
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"This episode is {rec.status}, not in review."
        )
    episode = Episode.model_validate(rec.episode)
    line = next((x for x in episode.lines() if x.id == line_id), None)
    if line is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such line.")
    text = " ".join(body.text.split())
    if not text:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A line cannot be empty.")
    if line.lang == "sat" and text not in santali_bank():
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Santali lines are spliced from recordings, so they must be a recorded phrase.",
        )
    edits = dict(rec.edits or {})
    before = edits.get(line_id, {}).get("before", line.text)
    line.text = text
    problems = rules.check(Episode.model_validate(episode.model_dump()))
    if problems:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "; ".join(problems))
    if text == before:  # changed back to the AI's wording
        edits.pop(line_id, None)
    else:
        edits[line_id] = {"before": before, "by": user.name, "at": datetime.now(UTC).isoformat()}
    rec.episode, rec.edits = episode.model_dump(), edits or None
    db.commit()
    return get_episode(episode_id, user, db)


class ReviewIn(BaseModel):
    decision: Literal["approve", "reject"]
    notes: str = Field(default="", max_length=4000)


@router.post("/episodes/{episode_id}/review")
def review_episode(episode_id: int, body: ReviewIn, user: Reviewer, db: DB) -> Detail:
    rec = _get(db, episode_id)
    if rec.status != "in_review":
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"This episode is {rec.status}, not in review."
        )
    if body.decision == "reject" and not body.notes.strip():
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "Say why it is rejected, so it can be fixed."
        )
    rec.status = "approved" if body.decision == "approve" else "rejected"
    rec.reviewed_by_id, rec.review_notes = user.id, body.notes.strip() or None
    db.commit()
    return get_episode(episode_id, user, db)


class PartTaps(BaseModel):
    """How classrooms answered one part's checkpoint, from the synced teacher taps."""

    segment_id: str
    taps: int  # deliberate taps; `auto` counts the checkpoints nobody tapped
    most: int
    some: int
    few: int
    auto: int


def _taps(db: Session, rec: EpisodeRecord) -> list[PartTaps]:
    rows = db.execute(
        select(SyncEvent.segment_id, SyncEvent.tap, SyncEvent.auto, func.count())
        .where(SyncEvent.episode_id == rec.episode["id"])
        .group_by(SyncEvent.segment_id, SyncEvent.tap, SyncEvent.auto)
    ).all()
    out = {s["id"]: PartTaps(segment_id=s["id"], taps=0, most=0, some=0, few=0, auto=0)
           for s in rec.episode["segments"]}  # fmt: skip
    for seg, tap, auto, n in rows:
        part = out.get(seg)
        if part is None:
            continue  # a segment an older version had
        if auto:
            part.auto += n
        elif tap in ("most", "some", "few"):
            setattr(part, tap, getattr(part, tap) + n)
            part.taps += n
    return list(out.values())


@router.get("/episodes/{episode_id}/classroom")
def classroom(episode_id: int, _: Reviewer, db: DB) -> list[PartTaps]:
    rec = _get(db, episode_id)
    return _taps(db, rec) if rec.episode else []


class RewriteIn(BaseModel):
    note: str = Field(default="", max_length=1000)  # what the reviewer wants changed


def evidence(part: PartTaps, note: str) -> str:
    """What the scriptwriter is told about how this part went in class."""
    lines = []
    if part.taps:
        pct = {k: round(100 * getattr(part, k) / part.taps) for k in ("most", "some", "few")}
        lines.append(
            f"Teachers tapped this part's checkpoint {part.taps} times: most got it "
            f"{pct['most']}%, some got it {pct['some']}%, few got it {pct['few']}%."
        )
    if part.auto:
        lines.append(f"{part.auto} times nobody tapped, so the core branch played.")
    if note.strip():
        lines.append(f"Reviewer: {note.strip()}")
    return "\n".join(lines)


@router.post(
    "/episodes/{episode_id}/segments/{segment_id}/rewrite", status_code=status.HTTP_202_ACCEPTED
)
def rewrite(
    episode_id: int,
    segment_id: str,
    body: RewriteIn,
    user: Reviewer,
    db: DB,
    tasks: BackgroundTasks,
) -> Summary:
    """Claude rewrites one part from classroom data and the reviewer's note, as a new version that
    goes through the guardrails and human review again. Approving it makes it the version used."""
    rec = _get(db, episode_id)
    if rec.episode is None or rec.status not in ("in_review", "approved"):
        raise HTTPException(status.HTTP_409_CONFLICT, f"This episode is {rec.status}.")
    part = next((p for p in _taps(db, rec) if p.segment_id == segment_id), None)
    if part is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such part.")
    why = evidence(part, body.note)
    if not why:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "No classroom taps for this part yet: add a note saying what to change.",
        )
    _check_daily_limit(db)
    new = EpisodeRecord(lesson_id=rec.lesson_id, district_id=rec.district_id, created_by_id=user.id)
    db.add(new)
    db.commit()
    tasks.add_task(run_rewrite, new.id, rec.id, segment_id, why)
    return Summary(**_summary(new))


def run_rewrite(record_id: int, source_id: int, segment_id: str, why: str) -> None:
    with database.SessionLocal() as db:
        rec, source = db.get(EpisodeRecord, record_id), db.get(EpisodeRecord, source_id)
        try:
            lesson, district = lessons()[rec.lesson_id], districts()[rec.district_id]
            bank = santali_bank() if district.home_lang == "sat" else None
            old = Episode.model_validate(source.episode)
            episode = scriptwriter.rewrite_segment(lesson, district, old, segment_id, why, bank)
            review = judge.review(episode, lesson, district)
        except Exception as e:  # any failure must end the job, or it shows "generating" forever
            log.exception("rewrite %s failed", record_id)
            rec.status, rec.error = "failed", f"{type(e).__name__}: {e}"[:2000]
        else:
            rec.status = "in_review"
            rec.episode, rec.review = episode.model_dump(), review.model_dump()
        db.commit()
