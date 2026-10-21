"""episode source

Revision ID: 9d4e2f7a1c58
Revises: 7c3baab45839
Create Date: 2026-10-21 10:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9d4e2f7a1c58"
down_revision: str | Sequence[str] | None = "7c3baab45839"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "episodes",
        sa.Column("source", sa.String(length=10), server_default="factory", nullable=False),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("episodes", "source")
