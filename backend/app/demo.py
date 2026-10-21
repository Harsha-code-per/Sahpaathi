"""The demo sign-in hint: lets the sign-in pages show the test accounts and their password.

This is a demo and evaluation convenience, on purpose. The accounts are the three seeded test users
(app/seed.py), whose password is DEMO_PASSWORD. The endpoint exists only when DEMO_PASSWORD is set,
which is the same condition under which those accounts are created: a deployment with real users
does not set it, so there is nothing to show and the route answers 404. The password is never in git
or in the frontend build: it comes from the server's own environment when the page asks.
"""

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel

from app.config import settings
from app.seed import DEMO_USERS

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class DemoAccount(BaseModel):
    role: str
    email: str


class DemoOut(BaseModel):
    password: str
    accounts: list[DemoAccount]


@router.get("/demo")
def demo_credentials(response: Response) -> DemoOut:
    if not settings.demo_password:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No demo accounts here.")
    response.headers["Cache-Control"] = "no-store"
    return DemoOut(
        password=settings.demo_password,
        accounts=[DemoAccount(role=role, email=email) for email, _name, role in DEMO_USERS],
    )
