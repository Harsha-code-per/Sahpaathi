from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class VoiceSettings(BaseSettings):
    """Voice-layer keys, read from env vars or backend/.env (kept apart from the core settings)."""

    model_config = SettingsConfigDict(env_file=Path(__file__).parents[2] / ".env", extra="ignore")

    tts_api_key: str = ""
    pack_signing_key: str = ""
