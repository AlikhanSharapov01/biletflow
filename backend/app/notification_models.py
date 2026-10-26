"""BF-15 tables: in-app inbox rows and their per-channel delivery bookkeeping.

Follows notification / notification_delivery from docs/database.
"""

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKeyConstraint,
    Index,
    Integer,
    Table,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID

from .models import Base


def _created():
    return Column(
        "created_at",
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )


class Notification(Base):
    __table__ = Table(
        "notification",
        Base.metadata,
        Column(
            "id", PGUUID, nullable=False, primary_key=True, server_default=text("gen_random_uuid()")
        ),
        Column("recipient_user_id", PGUUID, nullable=False),
        Column("event_id", PGUUID, nullable=True),
        Column("kind", Text, nullable=False),
        Column("locale", Text, nullable=False),
        Column("deduplication_key", Text, nullable=False),
        Column("safe_payload", JSONB, nullable=False),
        Column("read_at", DateTime(timezone=True), nullable=True),
        _created(),
        CheckConstraint("locale IN ('kk','ru','en')", name="notification_ck1"),
        CheckConstraint("jsonb_typeof(safe_payload) = 'object'", name="notification_ck2"),
        UniqueConstraint("recipient_user_id", "deduplication_key", name="notification_uq1"),
        ForeignKeyConstraint(
            ["recipient_user_id"],
            ["biletflow.app_user.id"],
            name="fk_notification_117",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["event_id"],
            ["biletflow.event.id"],
            name="fk_notification_118",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
    )


class NotificationDelivery(Base):
    __table__ = Table(
        "notification_delivery",
        Base.metadata,
        Column(
            "id", PGUUID, nullable=False, primary_key=True, server_default=text("gen_random_uuid()")
        ),
        Column("notification_id", PGUUID, nullable=False),
        Column("channel", Text, nullable=False),
        Column("status", Text, nullable=False, server_default=text("'pending'")),
        Column("attempt_count", Integer, nullable=False, server_default=text("0")),
        Column("next_attempt_at", DateTime(timezone=True), nullable=True),
        Column("provider_message_id", Text, nullable=True),
        Column("sent_at", DateTime(timezone=True), nullable=True),
        Column("last_error", Text, nullable=True),
        _created(),
        CheckConstraint("channel IN ('email','in_app')", name="notification_delivery_ck1"),
        CheckConstraint("status IN ('pending','sent','failed')", name="notification_delivery_ck2"),
        CheckConstraint("attempt_count >= 0", name="notification_delivery_ck3"),
        CheckConstraint(
            "status <> 'sent' OR sent_at IS NOT NULL", name="notification_delivery_ck4"
        ),
        UniqueConstraint("notification_id", "channel", name="notification_delivery_uq1"),
        ForeignKeyConstraint(
            ["notification_id"],
            ["biletflow.notification.id"],
            name="fk_notification_delivery_069",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
    )


Index("ix_inbox", Notification.recipient_user_id, Notification.created_at, Notification.id)
Index(
    "ix_delivery_ready",
    NotificationDelivery.next_attempt_at,
    postgresql_where=NotificationDelivery.status == "pending",
)
