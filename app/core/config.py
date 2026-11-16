import os
from pathlib import Path
from urllib.parse import urlsplit

from dotenv import dotenv_values
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ENV_FILE = ROOT / "data" / "config" / "env" / "video-editor" / ".env"


class Settings(BaseModel):
    app_name: str = "Video Editor"
    app_env: str = "production"
    app_debug: bool = False
    app_host: str = "127.0.0.1"
    app_port: int = Field(default=8011, ge=1, le=65535)
    database_url: str = f"sqlite:///{ROOT / 'data' / 'video_editor.sqlite3'}"
    cors_origins: list[str] = Field(default_factory=list)
    trusted_hosts: list[str] = Field(default_factory=lambda: ["localhost", "127.0.0.1"])
    log_level: str = "INFO"
    preset_write_enabled: bool = False
    preset_write_key: str | None = None
    stt_base_url: str = "http://127.0.0.1:8765"
    stt_api_key: str | None = None
    stt_connect_timeout_seconds: float = Field(default=10.0, gt=0, le=60)
    stt_upload_timeout_seconds: float = Field(default=600.0, gt=0, le=3600)
    stt_request_timeout_seconds: float = Field(default=30.0, gt=0, le=300)
    stt_poll_retry_count: int = Field(default=2, ge=0, le=5)
    stt_max_upload_bytes: int = Field(default=500 * 1024 * 1024, gt=0, le=500 * 1024 * 1024)
    stt_job_ttl_seconds: int = Field(default=24 * 60 * 60, gt=0, le=7 * 24 * 60 * 60)
    stt_max_jobs: int = Field(default=128, gt=0, le=10000)
    stt_max_active_jobs: int = Field(default=1, gt=0, le=100)

    @field_validator("database_url")
    @classmethod
    def sqlite_only(cls, value):
        if make_url(value).get_backend_name() != "sqlite":
            raise ValueError("DATABASE_URL must use SQLite")
        return value

    @field_validator("cors_origins", "trusted_hosts", mode="before")
    @classmethod
    def parse_list(cls, value):
        if isinstance(value, str):
            return [part.strip() for part in value.split(",") if part.strip()]
        return value

    @field_validator("cors_origins")
    @classmethod
    def valid_origins(cls, value):
        for origin in value:
            parsed = urlsplit(origin)
            if (
                parsed.scheme not in ("http", "https")
                or not parsed.netloc
                or parsed.path
                or parsed.query
                or parsed.fragment
                or "*" in origin
            ):
                raise ValueError("CORS origins must be explicit HTTP or HTTPS origins")
        return value


def load_settings(env_file: Path | None = None) -> Settings:
    path = env_file if env_file is not None else DEFAULT_ENV_FILE
    file_values = dotenv_values(path) if path.is_file() else {}
    values = {}

    for name in Settings.model_fields.keys():
        key = name.upper()
        value = os.environ.get(key, file_values.get(key))

        if value is not None:
            values[name] = value

    return Settings.model_validate(values)
