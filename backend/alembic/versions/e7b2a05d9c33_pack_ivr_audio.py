"""pack ivr audio

Revision ID: e7b2a05d9c33
Revises: c41d9e0b7a15
Create Date: 2026-10-18 22:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e7b2a05d9c33"
down_revision: str | Sequence[str] | None = "c41d9e0b7a15"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("packs", sa.Column("recap", sa.LargeBinary(), nullable=True))
    op.add_column("packs", sa.Column("menu", sa.LargeBinary(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("packs", "menu")
    op.drop_column("packs", "recap")
