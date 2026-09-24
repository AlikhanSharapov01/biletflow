from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    MetaData,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    metadata = MetaData(schema="biletflow")


class Row:
    id: Mapped[UUID] = mapped_column(
        PGUUID, primary_key=True, server_default=text("gen_random_uuid()")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP")
    )


def user_fk():
    return mapped_column(
        PGUUID,
        ForeignKey("biletflow.app_user.id", ondelete="RESTRICT", onupdate="RESTRICT"),
        index=True,
    )


class User(Row, Base):
    __tablename__ = "app_user"
    __table_args__ = (
        CheckConstraint(
            "email = lower(btrim(email)) AND position('@' in email) > 1", name="app_user_ck1"
        ),
        CheckConstraint("locale IN ('kk','ru','en')", name="app_user_ck2"),
        CheckConstraint("status IN ('active','suspended')", name="app_user_ck3"),
    )
    email: Mapped[str] = mapped_column(Text, unique=True)
    password_hash: Mapped[str | None] = mapped_column(Text)
    display_name: Mapped[str] = mapped_column(Text)
    locale: Mapped[str] = mapped_column(Text, server_default="ru")
    status: Mapped[str] = mapped_column(Text, server_default="active")
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    analytics_consent: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    consent_recorded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP")
    )


class AuthSession(Row, Base):
    __tablename__ = "auth_session"
    __table_args__ = (
        UniqueConstraint("id", "user_id"),
        CheckConstraint("client_kind IN ('web','scanner')", name="auth_session_client_kind"),
        CheckConstraint("expires_at > created_at", name="auth_session_expiry"),
    )
    user_id: Mapped[UUID] = user_fk()
    refresh_token_hash: Mapped[str] = mapped_column(Text, unique=True)
    client_kind: Mapped[str] = mapped_column(Text)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RefreshToken(Row, Base):
    __tablename__ = "refresh_token"
    session_id: Mapped[UUID] = mapped_column(
        PGUUID,
        ForeignKey("biletflow.auth_session.id", ondelete="RESTRICT", onupdate="RESTRICT"),
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(Text, unique=True)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AccountToken(Row, Base):
    __tablename__ = "account_token"
    __table_args__ = (
        CheckConstraint(
            "purpose IN ('email_verify','password_reset')", name="account_token_purpose"
        ),
        CheckConstraint("expires_at > created_at", name="account_token_expiry"),
    )
    user_id: Mapped[UUID] = user_fk()
    purpose: Mapped[str] = mapped_column(Text)
    token_hash: Mapped[str] = mapped_column(Text, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ExternalIdentity(Row, Base):
    __tablename__ = "external_identity"
    __table_args__ = (
        UniqueConstraint("provider", "subject"),
        UniqueConstraint("user_id", "provider"),
        CheckConstraint("provider = 'google'", name="external_identity_provider"),
    )
    user_id: Mapped[UUID] = user_fk()
    provider: Mapped[str] = mapped_column(Text)
    subject: Mapped[str] = mapped_column(Text)


class OAuthAttempt(Row, Base):
    __tablename__ = "oauth_attempt"
    __table_args__ = (CheckConstraint("expires_at > created_at", name="oauth_attempt_expiry"),)
    state_hash: Mapped[str] = mapped_column(Text, unique=True)
    browser_hash: Mapped[str] = mapped_column(Text)
    link_session_id: Mapped[UUID | None] = mapped_column(
        PGUUID,
        ForeignKey("biletflow.auth_session.id", ondelete="RESTRICT", onupdate="RESTRICT"),
        index=True,
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RateBucket(Row, Base):
    __tablename__ = "auth_rate_bucket"
    key_hash: Mapped[str] = mapped_column(Text, unique=True)
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer)
    __table_args__ = (CheckConstraint("attempts > 0", name="auth_rate_bucket_positive"),)


class AuditLog(Row, Base):
    __tablename__ = "audit_log"
    __table_args__ = (
        CheckConstraint("num_nonnulls(actor_user_id,service_actor) = 1", name="audit_actor"),
        CheckConstraint("jsonb_typeof(safe_change) = 'object'", name="audit_object"),
        CheckConstraint("event_id IS NULL OR organization_id IS NOT NULL", name="audit_scope"),
        ForeignKeyConstraint(
            ["event_id", "organization_id"],
            ["biletflow.event.id", "biletflow.event.organization_id"],
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["organization_id"],
            ["biletflow.organization.id"],
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
    )
    event_id: Mapped[UUID | None] = mapped_column(PGUUID)
    organization_id: Mapped[UUID | None] = mapped_column(PGUUID)
    actor_user_id: Mapped[UUID | None] = user_fk()
    service_actor: Mapped[str | None] = mapped_column(Text)
    action: Mapped[str] = mapped_column(Text)
    entity_type: Mapped[str] = mapped_column(Text)
    entity_id: Mapped[UUID] = mapped_column(PGUUID)
    description: Mapped[str] = mapped_column(Text)
    safe_change: Mapped[dict] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    correlation_id: Mapped[UUID] = mapped_column(PGUUID)


class OutboxJob(Row, Base):
    __tablename__ = "outbox_job"
    __table_args__ = (
        CheckConstraint("status IN ('pending','leased','done','dead')", name="outbox_status"),
        CheckConstraint("attempt_count >= 0", name="outbox_attempts"),
        CheckConstraint("jsonb_typeof(payload) = 'object'", name="outbox_object"),
        CheckConstraint(
            "(status = 'leased' AND lease_token IS NOT NULL AND lease_until IS NOT NULL) OR (status <> 'leased' AND lease_token IS NULL AND lease_until IS NULL)",
            name="outbox_lease",
        ),
        CheckConstraint("status <> 'done' OR completed_at IS NOT NULL", name="outbox_completed"),
        ForeignKeyConstraint(
            ["event_id"], ["biletflow.event.id"], ondelete="RESTRICT", onupdate="RESTRICT"
        ),
    )
    event_id: Mapped[UUID | None] = mapped_column(PGUUID)
    kind: Mapped[str] = mapped_column(Text)
    deduplication_key: Mapped[str] = mapped_column(Text, unique=True)
    payload: Mapped[dict] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(Text, server_default="pending")
    attempt_count: Mapped[int] = mapped_column(Integer, server_default="0")
    available_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP")
    )
    lease_token: Mapped[UUID | None] = mapped_column(PGUUID)
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
