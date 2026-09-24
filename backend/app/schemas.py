from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class EmailInput(Input):
    email: EmailStr = Field(max_length=254)

    @field_validator("email", mode="before")
    @classmethod
    def normalize(cls, value):
        return value.strip().lower() if isinstance(value, str) else value


Password = Annotated[str, Field(min_length=12, max_length=128)]
Token = Annotated[str, Field(min_length=1, max_length=2048)]


class Register(EmailInput):
    password: Password
    display_name: str = Field(min_length=1, max_length=100, pattern=r"\S")
    locale: Literal["kk", "ru", "en"] = "ru"


class Login(EmailInput):
    password: str = Field(min_length=1, max_length=128)
    client_kind: Literal["web", "scanner"] = "web"


class TokenInput(Input):
    token: Token


class Reset(TokenInput):
    password: Password


class Refresh(Input):
    refresh_token: Token | None = None


class ProfileUpdate(Input):
    display_name: str | None = Field(None, min_length=1, max_length=100, pattern=r"\S")
    locale: Literal["kk", "ru", "en"] | None = None
    analytics_consent: bool | None = None


class Profile(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    email: str
    display_name: str
    locale: str
    email_verified_at: datetime | None
    analytics_consent: bool


class SessionView(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    client_kind: str
    created_at: datetime
    expires_at: datetime
    revoked_at: datetime | None
    last_seen_at: datetime | None


class TokenPair(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_token: str | None = None


class Message(BaseModel):
    code: str


class AuthorizationURL(BaseModel):
    authorization_url: str
