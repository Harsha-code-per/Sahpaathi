"""sync events

Revision ID: c41d9e0b7a15
Revises: 8a3f1c7e2b40
Create Date: 2026-10-18 20:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c41d9e0b7a15"
down_revision: str | Sequence[str] | None = "8a3f1c7e2b40"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "sync_events",
        sa.Column("event_id", sa.String(length=64), nullable=False),
        sa.Column("episode_id", sa.String(length=100), nullable=False),
        sa.Column("segment_id", sa.String(length=100), nullable=False),
        sa.Column("tap", sa.String(length=10), nullable=False),
        sa.Column("auto", sa.Boolean(), nullable=False),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("tap IN ('few', 'some', 'most')", name=op.f("ck_sync_events_tap_known")),
        sa.PrimaryKeyConstraint("event_id", name=op.f("pk_sync_events")),
    )
    op.create_index(op.f("ix_sync_events_episode_id"), "sync_events", ["episode_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_sync_events_episode_id"), table_name="sync_events")
    op.drop_table("sync_events")
