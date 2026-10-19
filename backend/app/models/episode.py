"""Episode model and status constraints."""

from datetime import UTC, datetime

from sqlalchemy import CheckConstraint, DateTime, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Episode(Base):
    """Episode metadata, learning outcomes, guardrail scores, and generated content."""

    __tablename__ = "episodes"
    __table_args__ = (
        CheckConstraint(
            "grade >= 1 AND grade <= 5",
            name="ck_episodes_grade",
        ),
        CheckConstraint(
            "subject IN ('numeracy', 'literacy')",
            name="ck_episodes_subject",
        ),
        CheckConstraint(
            "status IN ('generating', 'failed', 'in_review', 'approved', 'packed')",
            name="ck_episodes_status",
        ),
    )

    id: Mapped[str] = mapped_column(
        String(128),
        primary_key=True,
    )
    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    grade: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    subject: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )
    nipun_lo: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )
    home_lang: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
    )
    school_lang: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
    )
    district: Mapped[str] = mapped_column(
        String(128),
        index=True,
        nullable=False,
    )
    duration_min: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=15,
    )
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="generating",
        index=True,
    )
    guardrail_scores: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
    )
    episode_data: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    packs: Mapped[list["Pack"]] = relationship(  # noqa: F821
        back_populates="episode",
        cascade="all, delete-orphan",
    )
    ivr_calls: Mapped[list["IVRCall"]] = relationship(  # noqa: F821
        back_populates="episode",
    )

    def __repr__(self) -> str:
        return f"<Episode id={self.id!r} grade={self.grade} status={self.status!r}>"
