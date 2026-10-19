"""Database engine, base model, and session lifecycle management."""

from collections.abc import Generator

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    echo=False,
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models."""

    pass


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a database session and guarantees closure."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def check_db_connectivity(target_engine: Engine | None = None) -> bool:
    """Executes a lightweight SELECT 1 query to verify database connectivity.

    Guarantees connection release. Returns True if database is reachable, False otherwise.
    Never exposes internal credentials or error details.
    """
    target = target_engine or engine
    try:
        with target.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


def ping_db() -> bool:
    """FastAPI dependency wrapper for database connectivity check."""
    return check_db_connectivity()
