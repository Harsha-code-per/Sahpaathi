"""packs

Revision ID: 8a3f1c7e2b40
Revises: 5d67be5ca331
Create Date: 2026-10-18 19:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "8a3f1c7e2b40"
down_revision: str | Sequence[str] | None = "5d67be5ca331"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "packs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("episode_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("data", sa.LargeBinary(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status != 'failed' OR error IS NOT NULL", name=op.f("ck_packs_failure_has_error")
        ),
        sa.CheckConstraint(
            "status != 'ready' OR data IS NOT NULL", name=op.f("ck_packs_ready_has_data")
        ),
        sa.CheckConstraint(
            "status IN ('building', 'ready', 'failed')", name=op.f("ck_packs_status_known")
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"], ["users.id"], name=op.f("fk_packs_created_by_id_users")
        ),
        sa.ForeignKeyConstraint(
            ["episode_id"], ["episodes.id"], name=op.f("fk_packs_episode_id_episodes")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_packs")),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("packs")
