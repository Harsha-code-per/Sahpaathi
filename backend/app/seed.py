"""Development database seeder for test accounts.

Creates default teacher, reviewer, and admin users with securely hashed passwords.
Idempotent: safe to run multiple times without duplicating or overwriting accounts.
Refuses to execute in production environments.

Usage:
    SEED_PASSWORD="dev_password_here" python -m app.seed
Or with role-specific passwords:
    SEED_TEACHER_PASSWORD="pw1" SEED_REVIEWER_PASSWORD="pw2" \
    SEED_ADMIN_PASSWORD="pw3" python -m app.seed
"""

import os
import sys

from sqlalchemy import select

from app.auth.security import hash_password
from app.config import settings
from app.db import SessionLocal
from app.models.user import User

SEED_USERS = [
    {
        "email": "teacher@sahpaathi.org",
        "role": "teacher",
        "env_var": "SEED_TEACHER_PASSWORD",
    },
    {
        "email": "reviewer@sahpaathi.org",
        "role": "reviewer",
        "env_var": "SEED_REVIEWER_PASSWORD",
    },
    {
        "email": "admin@sahpaathi.org",
        "role": "admin",
        "env_var": "SEED_ADMIN_PASSWORD",
    },
]


def seed_development_users() -> dict[str, str]:
    """Seed development test accounts. Returns a status mapping for each email."""
    if settings.environment.lower() in ("production", "prod") or os.environ.get(
        "ENVIRONMENT", ""
    ).lower() in ("production", "prod"):
        raise RuntimeError("Refusing to run seed script in production environment.")

    default_password = os.environ.get("SEED_PASSWORD")
    results = {}

    with SessionLocal() as db:
        for entry in SEED_USERS:
            email = entry["email"]
            role = entry["role"]
            password = os.environ.get(entry["env_var"]) or default_password

            if not password:
                raise ValueError(
                    f"No password provided for {email}. Set {entry['env_var']} or SEED_PASSWORD."
                )

            existing = db.scalar(select(User).where(User.email == email))
            if existing is not None:
                results[email] = "already_exists"
                continue

            user = User(
                email=email,
                password_hash=hash_password(password),
                role=role,
            )
            db.add(user)
            results[email] = "created"

        db.commit()

    return results


def main() -> None:
    try:
        results = seed_development_users()
        for email, status_text in results.items():
            print(f"User {email}: {status_text}")
    except Exception as e:
        print(f"Error during seeding: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
