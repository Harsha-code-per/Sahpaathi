import json
from pathlib import Path
from typing import Annotated

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

DEV_SECRET = "dev-only-change-me"


class Settings(BaseSettings):
    # Real env vars win over the file; the file is only for local dev (absent in production).
    model_config = SettingsConfigDict(env_file=Path(__file__).parents[1] / ".env", extra="ignore")

    database_url: str = "postgresql+psycopg://sahpaathi:sahpaathi@localhost:5432/sahpaathi"
    jwt_secret: str = DEV_SECRET
    # A JSON list or comma-separated origins, e.g. https://sahpaathi.vercel.app
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
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
    # ...and per caller, so one person cannot use up everyone's day.
    tutor_ip_daily_turns: int = 100
    tutor_ip_daily_voice: int = 100
    # Plans from an attached PDF or photo use the larger model on a big input (~$1 each).
    tutor_daily_file_plans: int = 40
    tutor_ip_daily_file_plans: int = 6
    # The demo admin account is public for evaluators, so the costly admin actions are capped too.
    pack_daily_builds: int = 10  # Sarvam voice for a whole lesson + ffmpeg
    login_attempts_per_10_min: int = 10  # per IP; each check is a deliberately slow scrypt
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
    # Real calls go only to these numbers (comma-separated, e.g. the team's phones), at most
    # exotel_daily_calls a day: the demo admin login is public, so it must not ring strangers.
    exotel_allowed_numbers: Annotated[list[str], NoDecode] = []
    exotel_daily_calls: int = 20
    public_api_url: str = (
        ""  # this API as Exotel reaches it, e.g. https://sahpaathi-api.onrender.com
    )

    @field_validator("cors_origins", "exotel_allowed_numbers", mode="before")
    @classmethod
    def _list(cls, v: object) -> object:
        """Accept a JSON list or plain comma-separated values (easier to type in a dashboard)."""
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("["):
                return json.loads(v)
            return [part.strip() for part in v.split(",") if part.strip()]
        return v

    @model_validator(mode="after")
    def _real_secret(self) -> "Settings":
        """With the public default secret anyone could sign an admin token: allow it only on a
        developer's own machine (SQLite or a local database)."""
        local = self.database_url.startswith("sqlite") or any(
            h in self.database_url for h in ("@localhost", "@127.0.0.1")
        )
        if self.jwt_secret == DEV_SECRET and not local:
            raise ValueError("Set JWT_SECRET: the default is only for local development.")
        return self

    @field_validator("database_url")
    @classmethod
    def _use_psycopg(cls, v: str) -> str:
        """Neon and Render hand out postgres:// URLs; SQLAlchemy needs the psycopg driver named."""
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v.removeprefix(prefix)
        return v


settings = Settings()
