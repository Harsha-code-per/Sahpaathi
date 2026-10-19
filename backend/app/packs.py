"""Pack API: voice and sign an approved episode, list packs, download them (resumable on 2G).

Building takes minutes (one TTS call per line), so POST returns at once with status "building" and
the admin page polls. ponytail: in-process BackgroundTasks on one instance, like episode generation.
"""

import logging
import re
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.orm import Session, undefer

from app import db as database
from app.auth import require
from app.config import settings
from app.factory.schema import Episode
from app.models import EpisodeRecord, PackRecord, User
from app.voice.build import CACHE_DIR, MultiVoice, build_episode_pack
from app.voice.sarvam import SarvamTTS
from app.voice.settings import VoiceSettings
from app.voice.splicer import SantaliVoice
from app.voice.tts import TTSProvider

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["packs"])
Admin = Annotated[User, Depends(require("admin"))]
Anyone = Annotated[User, Depends(require("teacher", "reviewer", "admin"))]
DB = Annotated[Session, Depends(database.get_db)]


def make_voice(episode: Episode, cfg: VoiceSettings) -> TTSProvider:
    """Sarvam for ta/hi/or/en; the community phrase bank only if the episode has Santali lines."""
    providers: list[TTSProvider] = [SarvamTTS(cfg.tts_api_key, cache_dir=CACHE_DIR)]
    if any(line.lang == "sat" for line in episode.lines()):
        providers.append(SantaliVoice(settings.content_dir / "voices/santali"))
    return MultiVoice(*providers)


def run_pack_build(pack_id: int) -> None:
    with database.SessionLocal() as db:
        pack = db.get(PackRecord, pack_id)
        rec = db.get(EpisodeRecord, pack.episode_id)
        try:
            cfg = VoiceSettings()
            if not cfg.tts_api_key or not cfg.pack_signing_key:
                raise RuntimeError("TTS_API_KEY and PACK_SIGNING_KEY must be set on the server")
            episode = Episode.model_validate(rec.episode)
            with tempfile.TemporaryDirectory() as tmp:
                ivr = Path(tmp, "ivr")
                ivr.mkdir()
                out = build_episode_pack(
                    episode,
                    make_voice(episode, cfg),
                    cfg.pack_signing_key,
                    Path(tmp, "p.sahpaathi"),
                    ivr_dir=ivr,
                )
                pack.data = out.read_bytes()
                pack.recap = (ivr / "recap.opus").read_bytes()
                pack.menu = (ivr / "menu.opus").read_bytes()
            pack.size_bytes, pack.status = len(pack.data), "ready"
        except Exception as e:  # any failure must end the job, or it shows "building" forever
            log.exception("pack build %s failed", pack_id)
            pack.status, pack.error = "failed", f"{type(e).__name__}: {e}"[:2000]
        db.commit()


def fail_orphans(db: Session) -> None:
    """At startup: builds that were running died with the previous process."""
    db.execute(
        update(PackRecord)
        .where(PackRecord.status == "building")
        .values(status="failed", error="The server restarted while building. Build again.")
    )
    db.commit()


class PackSummary(BaseModel):
    id: int
    episode_id: int
    episode_slug: str | None  # the episode's own id: what attendance and catch-up calls use
    status: str
    error: str | None
    size_bytes: int | None
    title: str | None
    grade: int | None
    district_id: str
    created_at: datetime


def _summary(pack: PackRecord, rec: EpisodeRecord) -> PackSummary:
    ep = rec.episode or {}
    return PackSummary(
        id=pack.id,
        episode_id=pack.episode_id,
        episode_slug=ep.get("id"),
        status=pack.status,
        error=pack.error,
        size_bytes=pack.size_bytes,
        title=ep.get("title"),
        grade=ep.get("grade"),
        district_id=rec.district_id,
        created_at=pack.created_at,
    )


@router.post("/episodes/{episode_id}/pack", status_code=status.HTTP_202_ACCEPTED)
def build_pack(episode_id: int, user: Admin, db: DB, tasks: BackgroundTasks) -> PackSummary:
    rec = db.get(EpisodeRecord, episode_id)
    if rec is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such episode.")
    if rec.status != "approved":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"This episode is {rec.status}. Only approved ones get a pack.",
        )
    building = db.scalar(
        select(PackRecord.id).where(
            PackRecord.episode_id == episode_id, PackRecord.status == "building"
        )
    )
    if building is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "A pack is already being built for this.")
    pack = PackRecord(episode_id=episode_id, created_by_id=user.id)
    db.add(pack)
    db.commit()
    tasks.add_task(run_pack_build, pack.id)
    return _summary(pack, rec)


@router.get("/packs")
def list_packs(
    user: Anyone, db: DB, district_id: str | None = None, grade: int | None = None
) -> list[PackSummary]:
    """Teachers see finished packs; reviewers and admins also see building and failed ones."""
    q = select(PackRecord, EpisodeRecord).join(EpisodeRecord).order_by(PackRecord.id.desc())
    if user.role == "teacher":
        q = q.where(PackRecord.status == "ready")
    if district_id:
        q = q.where(EpisodeRecord.district_id == district_id)
    rows = [_summary(p, r) for p, r in db.execute(q)]
    return [s for s in rows if grade is None or s.grade == grade]


def parse_range(header: str, size: int) -> tuple[int, int] | None:
    """`bytes=a-b`, `bytes=a-` or `bytes=-n` to an inclusive (start, end); None if unsatisfiable."""
    m = re.fullmatch(r"bytes=(\d*)-(\d*)", header.strip())
    if not m or (m[1] == "" and m[2] == ""):
        return None
    if m[1] == "":  # the last n bytes
        n = int(m[2])
        return (max(size - n, 0), size - 1) if n > 0 else None
    start = int(m[1])
    end = min(int(m[2]), size - 1) if m[2] else size - 1
    return (start, end) if start <= end and start < size else None


@router.get("/packs/{pack_id}")
def download_pack(pack_id: int, _: Anyone, db: DB, range: Annotated[str | None, Header()] = None):
    pack = db.scalar(
        select(PackRecord).options(undefer(PackRecord.data)).where(PackRecord.id == pack_id)
    )
    if pack is None or pack.status != "ready":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such pack.")
    rec = db.get(EpisodeRecord, pack.episode_id)
    data: bytes = pack.data
    headers = {
        "Accept-Ranges": "bytes",
        "Content-Disposition": f'attachment; filename="{rec.episode["id"]}.sahpaathi"',
    }
    if range is None:
        return Response(data, media_type="application/octet-stream", headers=headers)
    span = parse_range(range, len(data))
    if span is None:
        raise HTTPException(
            status.HTTP_416_RANGE_NOT_SATISFIABLE,
            "That byte range is outside the pack.",
            headers={"Content-Range": f"bytes */{len(data)}"},
        )
    start, end = span
    headers["Content-Range"] = f"bytes {start}-{end}/{len(data)}"
    return Response(
        data[start : end + 1],
        status_code=status.HTTP_206_PARTIAL_CONTENT,
        media_type="application/octet-stream",
        headers=headers,
    )


@router.get("/packs/{pack_id}/ivr/{name}")
def ivr_audio(pack_id: int, name: Literal["recap", "menu"], _: Admin, db: DB) -> Response:
    """The absentee-call audio of a pack: `recap` (the lesson summary) or `menu` (press 1, 2, 3)."""
    column = getattr(PackRecord, name)
    pack = db.scalar(select(PackRecord).options(undefer(column)).where(PackRecord.id == pack_id))
    data = getattr(pack, name) if pack is not None and pack.status == "ready" else None
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such audio.")
    return Response(data, media_type="audio/ogg")
