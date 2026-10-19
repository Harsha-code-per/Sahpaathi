"""IVR telephone call tracking for absentee catch-up lessons."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class IVRCall(Base):
    """Outbound telephony call dispatch and DTMF response history for absent children."""

    __tablename__ = "ivr_calls"
    __table_args__ = (
        CheckConstraint(
            "status IN ('queued', 'ringing', 'completed', 'failed')",
            name="ck_ivr_calls_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    # Student identifier from attendance rosters (no separate students table exists)
    student_id: Mapped[str | None] = mapped_column(
        String(128),
        index=True,
        nullable=True,
    )
    # Parent contact phone number in E.164 format. MUST NEVER be exposed in application logs.
    parent_phone: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
    )
    episode_id: Mapped[str | None] = mapped_column(
        String(128),
        ForeignKey("episodes.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="queued",
        index=True,
    )
    dtmf_responses: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
        default=dict,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    episode: Mapped["Episode | None"] = relationship(  # noqa: F821
        back_populates="ivr_calls",
    )

    def __repr__(self) -> str:
        # Mask phone number to avoid accidental log disclosure
        if len(self.parent_phone) >= 7:
            masked = f"{self.parent_phone[:3]}...{self.parent_phone[-4:]}"
        else:
            masked = "***"
        return f"<IVRCall id={self.id} status={self.status!r} phone={masked!r}>"
