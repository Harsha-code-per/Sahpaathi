"""FastAPI dependencies for authentication and role-based authorization."""

import uuid
from collections.abc import Callable, Sequence
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.security import decode_access_token
from app.db import get_db
from app.models.user import User

# OAuth2 bearer scheme for token extraction and OpenAPI /docs integration
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/login",
    auto_error=True,
)


def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    """Resolve and validate the authenticated user from a bearer JWT token."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
        sub: str | None = payload.get("sub")
        if not sub:
            raise credentials_exception
    except (jwt.PyJWTError, ValueError) as err:
        raise credentials_exception from err

    user: User | None = None
    try:
        user_uuid = uuid.UUID(sub)
        user = db.scalar(select(User).where(User.id == user_uuid))
    except ValueError:
        user = db.scalar(select(User).where(User.email == sub))

    if user is None:
        raise credentials_exception

    return user


def require_role(
    allowed_roles: str | Sequence[str],
) -> Callable[[User], User]:
    """Dependency factory that validates the authenticated user has an authorized role.

    Accepts a single role string (e.g. 'admin') or a sequence of roles (e.g. ['reviewer', 'admin']).
    """
    roles = {allowed_roles} if isinstance(allowed_roles, str) else set(allowed_roles)

    def role_checker(current_user: Annotated[User, Depends(get_current_user)]) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Operation not permitted for current role",
            )
        return current_user

    return role_checker
