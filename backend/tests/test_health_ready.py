"""Tests for liveness (/health), readiness (/ready), and connection lifecycle."""

from fastapi import status
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from app.db import check_db_connectivity, engine, get_db, ping_db
from app.main import app


def test_health_liveness_succeeds_without_db():
    """GET /health must return 200 OK without touching the database."""
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"status": "ok"}


def test_ready_postgres_integration_succeeds():
    """GET /ready must return 200 and db: connected against real running PostgreSQL."""
    client = TestClient(app)
    response = client.get("/ready")
    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"status": "ok", "db": "connected"}


def test_ready_returns_503_when_database_fails():
    """GET /ready must return 503 Service Unavailable when the database is unreachable."""
    client = TestClient(app)
    # Simulate DB connectivity failure via dependency override
    app.dependency_overrides[ping_db] = lambda: False
    try:
        response = client.get("/ready")
        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        payload = response.json()
        assert payload == {"status": "error", "db": "unavailable"}
        # Verify no credentials or internal details leaked
        assert "password" not in str(payload)
        assert "postgresql" not in str(payload)
        assert "traceback" not in str(payload)
    finally:
        app.dependency_overrides.clear()


def test_check_db_connectivity_real_engine():
    """check_db_connectivity() must return True and release connection with active engine."""
    assert check_db_connectivity() is True
    # With explicit target engine
    assert check_db_connectivity(target_engine=engine) is True


def test_check_db_connectivity_failure_safe_and_releases():
    """check_db_connectivity() must return False and release resources when engine is invalid."""
    # Point engine to an unreachable port to simulate network failure
    dead_engine = create_engine(
        "postgresql+psycopg://sahpaathi:sahpaathi@127.0.0.1:54329/nonexistent",
        connect_args={"connect_timeout": 1},
    )
    try:
        assert check_db_connectivity(target_engine=dead_engine) is False
    finally:
        dead_engine.dispose()


def test_get_db_session_released_on_exception():
    """get_db() must guarantee connection release and session closure on exception."""
    gen = get_db()
    session = next(gen)
    session.execute(text("SELECT 1"))
    assert engine.pool.checkedout() >= 1

    try:
        gen.throw(RuntimeError("Simulated route error"))
    except RuntimeError:
        pass

    assert engine.pool.checkedout() == 0
