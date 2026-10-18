from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Real env vars win over the file; the file is only for local dev (absent in production).
    model_config = SettingsConfigDict(env_file=Path(__file__).parents[1] / ".env", extra="ignore")

    database_url: str = "postgresql+psycopg://sahpaathi:sahpaathi@localhost:5432/sahpaathi"
    jwt_secret: str = "dev-only-change-me"
    cors_origins: list[str] = ["http://localhost:5173"]
    anthropic_api_key: str = ""
    demo_password: str = ""  # password of the seeded demo accounts (app/seed.py)
    # Lessons, district profiles, samples, voice clips. Repo layout locally; /srv/content in Docker.
    content_dir: Path = Path(__file__).parents[2] / "content"

    @field_validator("database_url")
    @classmethod
    def _use_psycopg(cls, v: str) -> str:
        """Neon and Render hand out postgres:// URLs; SQLAlchemy needs the psycopg driver named."""
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v.removeprefix(prefix)
        return v


settings = Settings()
