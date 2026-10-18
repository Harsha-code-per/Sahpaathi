import os

# Before any app import: in-memory SQLite unless DATABASE_URL is set (CI sets it to Postgres).
os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ["JWT_SECRET"] = "test-only-secret-at-least-32-bytes-long"
