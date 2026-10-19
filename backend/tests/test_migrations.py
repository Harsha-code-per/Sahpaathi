import os
import sqlite3
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).parents[1]


def test_migrations_work_on_sqlite_for_local_dev(tmp_path):
    # CI migrates Postgres; a teammate without Docker migrates SQLite. Postgres-only SQL such as
    # now() still creates the tables there, then fails on the first insert, so insert a row.
    db = tmp_path / "dev.db"
    env = {**os.environ, "DATABASE_URL": f"sqlite+pysqlite:///{db}"}
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND,
        env=env,
        check=True,
        capture_output=True,
    )
    with sqlite3.connect(db) as c:
        c.execute(
            "INSERT INTO sync_events (event_id, episode_id, segment_id, tap, auto, at)"
            " VALUES ('e-12345678', 'ep', 's1', 'most', 0, '2026-10-19 04:00:00')"
        )
        assert c.execute("SELECT received_at FROM sync_events").fetchone()[0]
