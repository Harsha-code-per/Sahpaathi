"""Classroom synchronization log model and idempotency constraints."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class SyncLog(Base):
    """Classroom synchronization events (taps, attendance) with database idempotency."""

    __tablename__ = "sync_logs"
    __table_args__ = (
        CheckConstraint(
            "event_type IN ('tap', 'attendance')",
            name="ck_sync_logs_event_type",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    # Unique index on client_event_id is the primary barrier preventing duplicate batch inserts
    client_event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        unique=True,
        index=True,
        nullable=False,
    )
    teacher_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    school_id: Mapped[str | None] = mapped_column(
        String(128),
        index=True,
        nullable=True,
    )
    event_type: Mapped[str] = mapped_column(
        String(32),
        index=True,
        nullable=False,
    )
    payload: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
    )
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    teacher: Mapped["User | None"] = relationship(  # noqa: F821
        back_populates="sync_logs",
    )

    def __repr__(self) -> str:
        return (
            f"<SyncLog id={self.id} client_event_id={self.client_event_id} "
            f"type={self.event_type!r}>"
        )
