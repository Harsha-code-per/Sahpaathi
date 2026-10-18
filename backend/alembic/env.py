"""Migrations run against settings.database_url (DATABASE_URL). Online mode only."""

import app.models  # noqa: F401  (registers every table on Base.metadata)
from alembic import context
from app.db import Base, engine

with engine.connect() as connection:
    context.configure(connection=connection, target_metadata=Base.metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()
