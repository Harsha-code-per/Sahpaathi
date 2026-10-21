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
    # Loads clearly labelled SAMPLE classroom data (app/sample_data.py) on start, so the dashboard
    # is not empty for an evaluation. Admins can also load or remove it from the dashboard.
    demo_data: bool = False
    # Lessons the Studio may write per UTC day (~$1 of Claude credits each); protects the budget.
    generate_daily_limit: int = 10
    # Online teacher camera/mic perception (docs/SENSE.md): off until legal review and parental
    # consent, as the DPDP Act 2023 restricts behavioural monitoring of children.
    sense_enabled: bool = False
    # AI tutor (app/tutor.py) is open to anyone, so cap what it can spend per UTC day: Claude turns
    # (~₹0.1 each on Haiku) and Sarvam spoken replies.
    tutor_daily_turns: int = 600
    tutor_daily_voice: int = 600
    # Lessons, district profiles, samples, voice clips. Repo layout locally; /srv/content in Docker.
    content_dir: Path = Path(__file__).parents[2] / "content"
    # Real catch-up calls (app/ivr/exotel.py). Empty: only the Admin keypad simulator works.
    exotel_sid: str = ""
    exotel_api_key: str = ""
    exotel_api_token: str = ""
    exotel_subdomain: str = "api.exotel.com"  # api.in.exotel.com for the Mumbai cluster
    exotel_caller_id: str = ""  # your ExoPhone
    exotel_flow_id: str = ""  # App Bazaar > My Apps: the catch-up call flow
    exotel_webhook_key: str = ""  # a long random string, also put in the flow's URLs as ?key=
    public_api_url: str = (
        ""  # this API as Exotel reaches it, e.g. https://sahpaathi-api.onrender.com
    )

    @field_validator("database_url")
    @classmethod
    def _use_psycopg(cls, v: str) -> str:
        """Neon and Render hand out postgres:// URLs; SQLAlchemy needs the psycopg driver named."""
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v.removeprefix(prefix)
        return v


settings = Settings()
