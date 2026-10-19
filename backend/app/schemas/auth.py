"""Pydantic schemas for authentication requests and responses."""

from pydantic import BaseModel, ConfigDict


class LoginRequest(BaseModel):
    """Credentials payload for JSON login."""

    model_config = ConfigDict(extra="ignore")

    email: str
    password: str


class TokenResponse(BaseModel):
    """Access token payload returned upon successful authentication."""

    access_token: str
    token_type: str = "bearer"
    role: str
    expires_in: int
