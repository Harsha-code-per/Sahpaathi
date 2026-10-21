"""usage caps

Revision ID: c4a7e2d19b80
Revises: b6e91d3a4f27
Create Date: 2026-10-21 18:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c4a7e2d19b80"
down_revision: str | Sequence[str] | None = "b6e91d3a4f27"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "usage",
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("key", sa.String(length=80), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("day", "kind", "key"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("usage")
