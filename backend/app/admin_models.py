"""Platform administration tables (migration 0006_admin_moderation)."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Row, user_fk

REPORT_CATEGORIES = ("spam", "fraud", "inappropriate", "misleading", "safety", "other")


def optional_user_fk():
    return mapped_column(
        PGUUID, ForeignKey("biletflow.app_user.id", ondelete="RESTRICT", onupdate="RESTRICT")
    )


class PlatformAdmin(Row, Base):
    __tablename__ = "platform_admin"
    __table_args__ = (UniqueConstraint("user_id", name="platform_admin_uq1"),)
    user_id: Mapped[UUID] = mapped_column(
        PGUUID, ForeignKey("biletflow.app_user.id", ondelete="RESTRICT", onupdate="RESTRICT")
    )
    granted_by_user_id: Mapped[UUID | None] = optional_user_fk()
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class EventReport(Row, Base):
    __tablename__ = "event_report"
    __table_args__ = (
        CheckConstraint("status IN ('open','reviewing','resolved')", name="event_report_ck1"),
        CheckConstraint(
            "status <> 'resolved' OR (resolved_by_user_id IS NOT NULL AND resolved_at IS NOT NULL "
            "AND resolution IS NOT NULL)",
            name="event_report_ck2",
        ),
        Index(
            "uq_open_report",
            "event_id",
            "reporter_user_id",
            "category",
            unique=True,
            postgresql_where=text("status IN ('open','reviewing')"),
        ),
    )
    event_id: Mapped[UUID] = mapped_column(
        PGUUID, ForeignKey("biletflow.event.id", ondelete="RESTRICT", onupdate="RESTRICT")
    )
    reporter_user_id: Mapped[UUID] = user_fk()
    category: Mapped[str] = mapped_column(Text)
    description: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, server_default="open")
    reviewed_by_user_id: Mapped[UUID | None] = optional_user_fk()
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_by_user_id: Mapped[UUID | None] = optional_user_fk()
    resolution: Mapped[str | None] = mapped_column(Text)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ModerationAction(Row, Base):
    __tablename__ = "moderation_action"
    __table_args__ = (
        CheckConstraint("num_nonnulls(target_user_id, target_event_id) = 1", name="moderation_ck1"),
        CheckConstraint("action IN ('suspend','reinstate')", name="moderation_ck2"),
    )
    actor_user_id: Mapped[UUID] = user_fk()
    target_user_id: Mapped[UUID | None] = optional_user_fk()
    target_event_id: Mapped[UUID | None] = mapped_column(
        PGUUID, ForeignKey("biletflow.event.id", ondelete="RESTRICT", onupdate="RESTRICT")
    )
    action: Mapped[str] = mapped_column(Text)
    reason: Mapped[str] = mapped_column(Text)


class SettingVersion(Row, Base):
    __tablename__ = "platform_setting_version"
    __table_args__ = (
        UniqueConstraint("setting_key", "version", name="platform_setting_version_uq1"),
        CheckConstraint("version > 0", name="platform_setting_version_ck1"),
    )
    setting_key: Mapped[str] = mapped_column(Text)
    version: Mapped[int] = mapped_column(Integer)
    value: Mapped[dict | int | str | bool] = mapped_column(JSONB)
    effective_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    actor_user_id: Mapped[UUID] = user_fk()
    reason: Mapped[str | None] = mapped_column(Text)
