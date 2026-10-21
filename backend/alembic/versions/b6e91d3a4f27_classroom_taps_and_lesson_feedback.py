"""classroom on taps, and lesson feedback

Revision ID: b6e91d3a4f27
Revises: 9d4e2f7a1c58
Create Date: 2026-10-21 18:10:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b6e91d3a4f27"
down_revision: str | Sequence[str] | None = "9d4e2f7a1c58"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Nullable: taps from phones that have no classroom set up, and every tap sent before this, stay valid.
    op.add_column("sync_events", sa.Column("classroom_id", sa.String(length=40), nullable=True))
    op.create_index(op.f("ix_sync_events_classroom_id"), "sync_events", ["classroom_id"])
    op.create_table(
        "lesson_feedback",
        sa.Column("event_id", sa.String(length=64), nullable=False),
        sa.Column("episode_id", sa.String(length=100), nullable=False),
        sa.Column("classroom_id", sa.String(length=40), nullable=True),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("tags", sa.JSON(), nullable=False),
        sa.Column("comment", sa.String(length=300), nullable=False),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "rating >= 1 AND rating <= 5", name=op.f("ck_lesson_feedback_rating_in_range")
        ),
        sa.PrimaryKeyConstraint("event_id", name=op.f("pk_lesson_feedback")),
    )
    op.create_index(op.f("ix_lesson_feedback_episode_id"), "lesson_feedback", ["episode_id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_lesson_feedback_episode_id"), table_name="lesson_feedback")
    op.drop_table("lesson_feedback")
    op.drop_index(op.f("ix_sync_events_classroom_id"), table_name="sync_events")
    op.drop_column("sync_events", "classroom_id")
