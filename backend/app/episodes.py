"""Studio API: generate an episode in the background, list episodes, record the reviewer's decision.

Generation takes minutes (Sonnet writes, Haiku reviews, maybe one repair), so POST returns at once
with status "generating" and the Studio polls. ponytail: in-process BackgroundTasks on one
instance; move to a job queue if we ever run more than one backend instance.
"""

import logging
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app import db as database
from app.auth import require
from app.config import settings
from app.factory import judge
from app.factory.scriptwriter import District, Lesson
from app.models import EpisodeRecord, User
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


@router.post("/episodes", status_code=status.HTTP_202_ACCEPTED)
def generate(body: GenerateIn, user: Reviewer, db: DB, tasks: BackgroundTasks) -> Summary:
    if body.lesson_id not in lessons() or body.district_id not in districts():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown lesson or district.")
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
    )


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
