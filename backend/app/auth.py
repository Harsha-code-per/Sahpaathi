"""Login and role checks. Passwords: stdlib scrypt. Sessions: short-lived HS256 JWTs."""

import base64
import hashlib
import hmac
import os
from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import User

TOKEN_HOURS = 12
_SCRYPT = {"n": 2**14, "r": 8, "p": 1}

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, **_SCRYPT)
    return f"scrypt${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt, digest = stored.split("$")
        expected = base64.b64decode(digest)
        actual = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt), **_SCRYPT)
    except ValueError:
        return False
    return hmac.compare_digest(actual, expected)


def create_token(user: User) -> str:
    exp = datetime.now(UTC) + timedelta(hours=TOKEN_HOURS)
    claims = {"sub": str(user.id), "role": user.role, "exp": exp}
    return jwt.encode(claims, settings.jwt_secret, algorithm="HS256")


def current_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    unauthorized = HTTPException(status.HTTP_401_UNAUTHORIZED, "Please log in again.")
    if creds is None:
        raise unauthorized
    try:
        claims = jwt.decode(creds.credentials, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as e:
        raise unauthorized from e
    user = db.get(User, int(claims["sub"]))
    if user is None:
        raise unauthorized
    return user


def require(*roles: str):
    """Dependency: the logged-in user, if their role is one of `roles`."""

    def check(user: Annotated[User, Depends(current_user)]) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Your role cannot do this.")
        return user

    return check


class LoginIn(BaseModel):
    email: str
    password: str


class LoginOut(BaseModel):
    token: str
    role: str
    name: str


@router.post("/login")
def login(body: LoginIn, db: Annotated[Session, Depends(get_db)]) -> LoginOut:
    user = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong email or password.")
    return LoginOut(token=create_token(user), role=user.role, name=user.name)
