from datetime import datetime

from sqlalchemy import JSON, CheckConstraint, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

ROLES = ("teacher", "reviewer", "admin")
STATUSES = ("generating", "failed", "in_review", "approved", "rejected")


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
