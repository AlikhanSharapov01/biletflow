from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: SecretStr
    jwt_secret: SecretStr
    challenge_secret: SecretStr
    jwt_issuer: str = "biletflow"
    jwt_audience: str = "biletflow-api"
    access_minutes: int = Field(10, ge=1, le=30)
    session_days: int = Field(30, ge=1, le=90)
    environment: Literal["development", "test", "production"] = "development"
    allowed_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:8000",
        "http://localhost:8080",
    ]
    frontend_url: str = "http://localhost:5173"
    cookie_secure: bool = True
    google_client_id: str = ""
    google_client_secret: SecretStr = SecretStr("")
    google_redirect_uri: str = "http://localhost:8000/api/v1/auth/google/callback"
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_username: str = ""
    smtp_password: SecretStr = SecretStr("")
    smtp_starttls: bool = False
    email_from: str = "BiletFlow <noreply@biletflow.local>"
    rate_ip_limit: int = Field(30, ge=1)
    rate_identity_limit: int = Field(5, ge=1)
    rate_window_seconds: int = Field(60, ge=1)
    # BF-11: require a signed-in attendee's entry confirmation for every admission.
    admission_require_entry_confirmation: bool = True
    entry_confirmation_seconds: int = Field(120, ge=30, le=600)
    offline_package_minutes: int = Field(720, ge=5, le=2880)
    # BF-16: private file storage (app/storage.py) and support attachment limits.
    storage_root: str = "var/storage"
    attachment_max_bytes: int = Field(5 * 1024 * 1024, ge=1024)
    attachment_max_per_message: int = Field(5, ge=1, le=20)
    attachment_link_seconds: int = Field(300, ge=30, le=3600)

    @model_validator(mode="after")
    def secure_settings(self):
        secrets = [self.jwt_secret.get_secret_value(), self.challenge_secret.get_secret_value()]
        if (
            any(len(value.encode()) < 32 or value.startswith("replace-") for value in secrets)
            or secrets[0] == secrets[1]
        ):
            raise ValueError("Use two different random secrets of at least 32 bytes")
        if not self.database_url.get_secret_value().startswith("postgresql+psycopg://"):
            raise ValueError("A PostgreSQL psycopg URL is required")
        if self.environment == "production":
            if not self.cookie_secure or any(
                not x.startswith("https://") for x in self.allowed_origins
            ):
                raise ValueError("Production requires HTTPS origins and secure cookies")
            if not self.frontend_url.startswith(
                "https://"
            ) or not self.google_redirect_uri.startswith("https://"):
                raise ValueError("Production callback and frontend URLs must use HTTPS")
        return self
