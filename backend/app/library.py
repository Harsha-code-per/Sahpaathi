"""The reviewed episode library in content/episodes/, so a fresh deploy starts with real lessons.

Only a person approves an episode. The flow:
  1. queue:  generated episodes (python -m app.factory.judge output) go into the Studio as in_review
  2. a reviewer reads them line by line in the Studio and approves or rejects
  3. export: an approved episode is written to content/episodes/<episode id>.json and committed
  4. load:   on every start (app.seed), files not yet in the database are added as approved

CLI: python -m app.library queue <judge-output.json>... | export <record id>...
"""

import json
import sys
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.factory.judge import Review
from app.factory.schema import Episode
from app.models import EpisodeRecord, User

LIBRARY = settings.content_dir / "episodes"


def _reviewer(db: Session) -> User:
    user = db.scalar(select(User).where(User.role == "reviewer").order_by(User.id))
    if user is None:
        raise LookupError("no reviewer account; run python -m app.seed with DEMO_PASSWORD first")
    return user


def queue(db: Session, path: Path, lesson_id: str, district_id: str) -> EpisodeRecord:
    """A judge CLI output ({passed, episode, review}) becomes an in_review episode."""
    out = json.loads(path.read_text(encoding="utf-8"))
    rec = EpisodeRecord(
        lesson_id=lesson_id,
        district_id=district_id,
        status="in_review",
        episode=Episode.model_validate(out["episode"]).model_dump(),
        review=Review.model_validate(out["review"]).model_dump(),
        created_by_id=_reviewer(db).id,
    )
    db.add(rec)
    db.commit()
    return rec


def export(db: Session, record_id: int, out_dir: Path = LIBRARY) -> Path:
    rec = db.get(EpisodeRecord, record_id)
    if rec is None or rec.status != "approved":
        raise ValueError(f"episode {record_id} is not approved; only approved ones are exported")
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{rec.episode['id']}.json"
    keys = ("lesson_id", "district_id", "episode", "review", "review_notes", "edits")
    data = {k: getattr(rec, k) for k in keys}
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def load(db: Session, library: Path = LIBRARY) -> int:
    """Adds library episodes the database lacks, as approved. Returns how many were added."""
    approved = db.scalars(select(EpisodeRecord).where(EpisodeRecord.status == "approved"))
    have = {r.episode["id"] for r in approved}
    added = 0
    for path in sorted(library.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        episode = Episode.model_validate(data["episode"])
        if episode.id in have:
            continue
        reviewer = _reviewer(db)
        db.add(
            EpisodeRecord(
                lesson_id=data["lesson_id"],
                district_id=data["district_id"],
                status="approved",
                episode=episode.model_dump(),
                review=Review.model_validate(data["review"]).model_dump(),
                review_notes=data.get("review_notes"),
                edits=data.get("edits"),
                created_by_id=reviewer.id,
                reviewed_by_id=reviewer.id,
            )
        )
        added += 1
    db.commit()
    return added


if __name__ == "__main__":
    cmd, args = sys.argv[1], sys.argv[2:]
    with SessionLocal() as db:
        if cmd == "queue":
            for arg in args:  # names like g1-add-within-9__madurai-tamil.json, as the batch writes
                lesson_id, district_id = Path(arg).stem.split("__")
                print(f"queued {arg} as episode {queue(db, Path(arg), lesson_id, district_id).id}")
        elif cmd == "export":
            for arg in args:
                print(f"wrote {export(db, int(arg))}")
        else:
            sys.exit("usage: python -m app.library queue <file>... | export <record id>...")
