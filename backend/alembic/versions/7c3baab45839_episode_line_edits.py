"""episode line edits

Revision ID: 7c3baab45839
Revises: f3c8d1b46a72
Create Date: 2026-10-19 12:05:29.816104

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7c3baab45839"
down_revision: str | Sequence[str] | None = "f3c8d1b46a72"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("episodes", sa.Column("edits", sa.JSON(none_as_null=True), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("episodes", "edits")
