"""Create or refresh the demo accounts, one per role, all with DEMO_PASSWORD, then add the reviewed
episodes from content/episodes/ that the database does not have yet (app.library).

Run: python -m app.seed   (the Docker image runs it on start when DEMO_PASSWORD is set)
These are the test credentials evaluators get; there are no real users' accounts.
"""

import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import library, sample_data
from app.auth import hash_password
from app.config import settings
from app.db import SessionLocal
from app.models import User

DEMO_USERS = (
    ("teacher@sahpaathi.test", "Demo Teacher", "teacher"),
    ("reviewer@sahpaathi.test", "Demo Reviewer", "reviewer"),
    ("admin@sahpaathi.test", "Demo Admin", "admin"),
)


def seed(db: Session, password: str) -> None:
    for email, name, role in DEMO_USERS:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(email=email, name=name, role=role)
            db.add(user)
        user.password_hash = hash_password(password)  # so README credentials always work
    db.commit()


if __name__ == "__main__":
    with SessionLocal() as db:
        if settings.demo_password:
            seed(db, settings.demo_password)
        else:  # still load the lessons, and still let the server start (the Dockerfile uses &&)
            print("DEMO_PASSWORD is not set; no demo accounts created.", file=sys.stderr)
        added = library.load(db)
        extra = ""
        # SAMPLE classrooms (app/sample_data.py), only when none are loaded, so an admin
        # who pressed Remove does not get them back on the next restart.
        if settings.demo_data and not any(sample_data.counts(db).values()):
            extra = f"; loaded sample data {sample_data.load(db)}"
    print(f"seeded {len(DEMO_USERS)} demo accounts; added {added} reviewed episodes{extra}")
