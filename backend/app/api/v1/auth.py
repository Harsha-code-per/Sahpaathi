"""Authentication API routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.security import create_access_token, verify_password
from app.config import settings
from app.db import get_db
from app.models.user import User
from app.schemas.auth import TokenResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login with email and password",
)
async def login(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> TokenResponse:
    """Authenticate a user and return a JWT access token with role.

    Accepts JSON payloads (email/password or username/password)
    as well as OAuth2 password form data (username=...&password=...).
    """
    content_type = request.headers.get("content-type", "").lower()
    email: str | None = None
    password: str | None = None

    if "application/json" in content_type:
        try:
            data = await request.json()
            email = data.get("email") or data.get("username")
            password = data.get("password")
        except Exception as err:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid JSON payload",
            ) from err
    else:
        try:
            form = await request.form()
            email = form.get("username") or form.get("email")
            password = form.get("password")
        except Exception as err:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid form data",
            ) from err

    if not email or not password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Fetch user by email (case-insensitive)
    user = db.scalar(select(User).where(User.email == email.strip().lower()))
    if user is None:
        user = db.scalar(select(User).where(User.email == email.strip()))

    if user is None or not verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(
        data={
            "sub": str(user.id),
            "email": user.email,
            "role": user.role,
        }
    )

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        role=user.role,
        expires_in=settings.jwt_expire_minutes * 60,
    )
