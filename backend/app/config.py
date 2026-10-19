from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Real env vars win over the file; the file is only for local dev (absent in production).
    model_config = SettingsConfigDict(env_file=Path(__file__).parents[1] / ".env", extra="ignore")

    environment: str = "development"
    database_url: str = "postgresql+psycopg://sahpaathi:sahpaathi@localhost:5432/sahpaathi"
    jwt_secret: str = "dev-only-sahpaathi-insecure-local-jwt-secret-key-32chars"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24  # 24 hours
    cors_origins: list[str] = ["http://localhost:5173"]
    anthropic_api_key: str = ""

    @model_validator(mode="after")
    def _validate_production_secrets(self) -> "Settings":
        if self.environment.lower() in ("production", "prod"):
            if not self.jwt_secret or "dev-only" in self.jwt_secret or len(self.jwt_secret) < 32:
                raise ValueError(
                    "In production, JWT_SECRET must be set to a secure secret of "
                    "at least 32 characters."
                )
        return self


settings = Settings()
