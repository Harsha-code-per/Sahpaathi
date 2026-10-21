"""Caps for the endpoints that cost money or can be abused (the tutor, real calls, pack builds,
sign-in). Counted per UTC day in the database, so restarts and deploys do not reset them."""

from datetime import UTC, datetime

from fastapi import HTTPException, Request, status
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.models import Usage


def client_ip(request: Request) -> str:
    """The caller's address. Render puts it first in X-Forwarded-For.
    ponytail: a caller can forge that header to dodge a per-IP cap; the global cap still bounds the
    spend. Trust a signed edge header instead if per-IP fairness ever matters."""
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    return (forwarded or (request.client.host if request.client else "unknown"))[:80]


def spend(db: Session, kind: str, caps: list[tuple[str, int]], message: str, n: int = 1) -> None:
    """Counts `n` uses of `kind` against each (key, limit), like [("all", 600), (ip, 80)].
    Over any limit: 429 with `message`, and nothing is counted.
    ponytail: read-then-write, so two simultaneous requests can both squeeze under a limit by one;
    an atomic UPDATE ... RETURNING would close that if it ever matters."""
    today = datetime.now(UTC).date()
    db.execute(delete(Usage).where(Usage.day < today))  # yesterday's counters are no longer needed
    rows = []
    for key, limit in caps:
        row = db.get(Usage, (today, kind, key)) or Usage(day=today, kind=kind, key=key, count=0)
        if row.count + n > limit:
            db.rollback()
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, message)
        rows.append(row)
    for row in rows:
        row.count += n
        db.add(row)
    db.commit()
