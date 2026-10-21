"""Protections for a public demo: sign-in limits, the boot seed and the library never undoing a
reviewer's decision."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app import library
from app.config import settings
from app.db import Base, SessionLocal, engine
from app.main import app
from app.models import EpisodeRecord
from app.seed import seed


@pytest.fixture
def api():
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed(db, "pw-for-this-test")
    with TestClient(app) as client:
        yield client
    Base.metadata.drop_all(engine)


def test_sign_in_attempts_are_limited_per_caller(api, monkeypatch):
    monkeypatch.setattr(settings, "login_attempts_per_10_min", 2)
    wrong = {"email": "admin@sahpaathi.test", "password": "guess"}
    me = {"X-Forwarded-For": "203.0.113.9"}
    assert api.post("/api/v1/auth/login", json=wrong, headers=me).status_code == 401
    assert api.post("/api/v1/auth/login", json=wrong, headers=me).status_code == 401
    assert api.post("/api/v1/auth/login", json=wrong, headers=me).status_code == 429
    other = {"X-Forwarded-For": "198.51.100.1"}
    assert api.post("/api/v1/auth/login", json=wrong, headers=other).status_code == 401


def test_the_library_never_brings_back_a_rejected_lesson(api):
    with SessionLocal() as db:
        assert library.load(db) > 0
        for rec in db.scalars(select(EpisodeRecord)):
            rec.status, rec.review_notes = "rejected", "not for children"
        db.commit()
        assert library.load(db) == 0
        assert {r.status for r in db.scalars(select(EpisodeRecord))} == {"rejected"}


def test_tests_refuse_to_run_against_a_real_database():
    """The suite drops every table, so a production URL in the shell must stop it cold."""
    import subprocess
    import sys

    env = {"DATABASE_URL": "postgresql://u:p@ep-cool-1.neon.tech/prod", "PATH": ""}
    code = "exec(open('tests/conftest.py').read())"
    run = subprocess.run([sys.executable, "-c", code], env=env, capture_output=True, text=True)
    assert run.returncode != 0 and "non-local database" in run.stderr


def test_the_default_signing_secret_is_refused_outside_a_dev_machine():
    from pydantic import ValidationError

    from app.config import DEV_SECRET, Settings

    with pytest.raises(ValidationError, match="JWT_SECRET"):
        Settings(database_url="postgresql://u:p@ep-cool-1.neon.tech/prod", jwt_secret=DEV_SECRET)
    assert Settings(database_url="sqlite:///x.db", jwt_secret=DEV_SECRET)  # fine locally
