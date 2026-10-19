"""Application Pydantic schemas."""

from app.schemas.auth import LoginRequest, TokenResponse

__all__ = [
    "LoginRequest",
    "TokenResponse",
]
