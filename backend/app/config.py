from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://sahpaathi:sahpaathi@localhost:5432/sahpaathi"
    jwt_secret: str = "dev-only-change-me"
    cors_origins: list[str] = ["http://localhost:5173"]
    anthropic_api_key: str = ""


settings = Settings()
