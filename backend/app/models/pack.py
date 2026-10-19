"""Audio pack model and episode relationship."""

from datetime import UTC, datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Pack(Base):
    """Pack metadata, storage location, sha256 checksum, and cryptographic signature."""

    __tablename__ = "packs"

    id: Mapped[str] = mapped_column(
        String(128),
        primary_key=True,
    )
    episode_id: Mapped[str] = mapped_column(
        String(128),
        ForeignKey("episodes.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    district: Mapped[str] = mapped_column(
        String(128),
        index=True,
        nullable=False,
    )
    grade: Mapped[int] = mapped_column(
        Integer,
        index=True,
        nullable=False,
    )
    file_path: Mapped[str] = mapped_column(
        String(512),
        nullable=False,
    )
    file_size: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
    )
    sha256: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )
    signature: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    episode: Mapped["Episode"] = relationship(  # noqa: F821
        back_populates="packs",
    )

    def __repr__(self) -> str:
        return f"<Pack id={self.id!r} episode_id={self.episode_id!r} grade={self.grade}>"
