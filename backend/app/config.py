from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Real env vars win over the file; the file is only for local dev (absent in production).
    model_config = SettingsConfigDict(env_file=Path(__file__).parents[1] / ".env", extra="ignore")

    database_url: str = "postgresql+psycopg://sahpaathi:sahpaathi@localhost:5432/sahpaathi"
    jwt_secret: str = "dev-only-change-me"
    cors_origins: list[str] = ["http://localhost:5173"]
    anthropic_api_key: str = ""


settings = Settings()
