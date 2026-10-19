from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

ROLES = ("teacher", "reviewer", "admin")
STATUSES = ("generating", "failed", "in_review", "approved", "rejected")
PACK_STATUSES = ("building", "ready", "failed")


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class User(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint(_in("role", ROLES), name="role_known"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(20))
    password_hash: Mapped[str] = mapped_column(String(200))


class EpisodeRecord(Base):
    """One generation of one lesson for one district, from Claude to a reviewer's decision."""

    __tablename__ = "episodes"
    __table_args__ = (
        CheckConstraint(_in("status", STATUSES), name="status_known"),
        # Only a finished generation can be reviewed, and every decision names its reviewer.
        CheckConstraint(
            "status IN ('generating', 'failed') OR (episode IS NOT NULL AND review IS NOT NULL)",
            name="reviewable_has_content",
        ),
        CheckConstraint(
            "status NOT IN ('approved', 'rejected') OR reviewed_by_id IS NOT NULL",
            name="decision_has_reviewer",
        ),
        CheckConstraint("status != 'failed' OR error IS NOT NULL", name="failure_has_error"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    lesson_id: Mapped[str] = mapped_column(String(100))
    district_id: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(20), default="generating")
    episode: Mapped[dict | None] = mapped_column(JSON(none_as_null=True))  # factory Episode
    review: Mapped[dict | None] = mapped_column(JSON(none_as_null=True))  # judge Review
    error: Mapped[str | None] = mapped_column(Text)
    review_notes: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    reviewed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class PackRecord(Base):
    """A voiced, signed .sahpaathi pack of one approved episode.

    The file lives in the database (a pack is under 2 MB): Render's disk is wiped on every deploy,
    and this needs no storage account. ponytail: move `data` to R2 when packs outgrow Postgres.
    """

    __tablename__ = "packs"
    __table_args__ = (
        CheckConstraint(_in("status", PACK_STATUSES), name="status_known"),
        CheckConstraint("status != 'ready' OR data IS NOT NULL", name="ready_has_data"),
        CheckConstraint("status != 'failed' OR error IS NOT NULL", name="failure_has_error"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    episode_id: Mapped[int] = mapped_column(ForeignKey("episodes.id"))
    status: Mapped[str] = mapped_column(String(20), default="building")
    error: Mapped[str | None] = mapped_column(Text)
    size_bytes: Mapped[int | None] = mapped_column(Integer)
    data: Mapped[bytes | None] = mapped_column(LargeBinary, deferred=True)
    # The absentee call: a recap of the episode and the press-1/2/3 menu, both opus.
    recap: Mapped[bytes | None] = mapped_column(LargeBinary, deferred=True)
    menu: Mapped[bytes | None] = mapped_column(LargeBinary, deferred=True)
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class SyncEvent(Base):
    """One checkpoint tap uploaded by a teacher's phone. `event_id` is made on the device, so a
    retried upload can never count a tap twice."""

    __tablename__ = "sync_events"
    __table_args__ = (CheckConstraint(_in("tap", ("few", "some", "most")), name="tap_known"),)

    event_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    episode_id: Mapped[str] = mapped_column(String(100), index=True)  # the episode's own slug
    segment_id: Mapped[str] = mapped_column(String(100))
    tap: Mapped[str] = mapped_column(String(10))
    auto: Mapped[bool] = mapped_column(Boolean)  # true: nobody tapped, the 10 s fallback chose
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True))  # the device's clock
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


CALL_STATUSES = ("queued", "in_progress", "completed", "no_response")
CALL_OUTCOMES = ("understood", "help")


class CatchupCall(Base):
    """An absentee catch-up call for one child and one episode.

    The child is only ever an opaque `student_ref` (the teacher's roll number) inside a
    `classroom_id` code: no names and no phone numbers are stored. Dialling a real phone needs a
    separate, consented contact list, added when a telephony provider is connected.
    """

    __tablename__ = "catchup_calls"
    __table_args__ = (
        UniqueConstraint("classroom_id", "student_ref", "episode_slug"),  # one call per child
        CheckConstraint(_in("status", CALL_STATUSES), name="status_known"),
        CheckConstraint(
            "outcome IS NULL OR outcome IN ('understood', 'help')", name="outcome_known"
        ),
        # An outcome only exists once the parent answered.
        CheckConstraint("outcome IS NULL OR status = 'completed'", name="outcome_when_completed"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    classroom_id: Mapped[str] = mapped_column(String(40))
    student_ref: Mapped[str] = mapped_column(String(40))
    episode_slug: Mapped[str] = mapped_column(String(100))  # the episode's own id, as in packs
    status: Mapped[str] = mapped_column(String(20), default="queued")
    outcome: Mapped[str | None] = mapped_column(String(20))
    pack_id: Mapped[int | None] = mapped_column(ForeignKey("packs.id"))  # set when the call starts
    plays: Mapped[int] = mapped_column(Integer, default=0)  # times the recap was played
    missed: Mapped[int] = mapped_column(Integer, default=0)  # menus with no usable key
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
