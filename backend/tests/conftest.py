import os

# Tests create and DROP every table. Only ever point them at a throwaway database: SQLite, or a
# local Postgres (CI). A Neon URL exported in your shell would otherwise be wiped.
_url = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL") or ""
if (
    _url
    and not _url.startswith("sqlite")
    and not any(h in _url for h in ("@localhost", "@127.0.0.1"))
):
    raise SystemExit(
        "Refusing to run tests against a non-local database: they drop every table.\n"
        "Unset DATABASE_URL, or set TEST_DATABASE_URL to a throwaway local one."
    )
os.environ["DATABASE_URL"] = _url or "sqlite+pysqlite:///:memory:"
os.environ["JWT_SECRET"] = "test-only-secret-at-least-32-bytes-long"
os.environ.setdefault("LOGIN_ATTEMPTS_PER_10_MIN", "10000")  # tests sign in far more often
