#!/bin/sh
# Starts the real API for the browser smoke test: a fresh SQLite database, seeded demo accounts, and no
# paid keys (the tutor answers "not set up", which the test accepts). Used by playwright.config.ts.
set -e
cd "$(dirname "$0")/../../backend"
PY="${PYTHON:-.venv/bin/python}"
rm -f /tmp/sahpaathi-e2e.db
export DATABASE_URL=sqlite:////tmp/sahpaathi-e2e.db JWT_SECRET=e2e-only DEMO_PASSWORD=e2e-demo-pass
export CORS_ORIGINS='["http://localhost:4174"]' ANTHROPIC_API_KEY= LOGIN_ATTEMPTS_PER_10_MIN=1000
"$PY" -m alembic upgrade head
"$PY" -m app.seed
exec "$PY" -m uvicorn app.main:app --port 8011
