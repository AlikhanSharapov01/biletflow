"""Stage D tables: entry confirmations, scanner devices and offline synchronization.

Mirrors migration 0007_entry_offline. See the header of its SQL file for the documented
deviations from the long-term database specification.
"""

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKeyConstraint,
    Index,
    Table,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID

from .models import Base


def pk():
    return Column(
        "id", PGUUID, nullable=False, primary_key=True, server_default=text("gen_random_uuid()")
    )


def created():
    return Column(
        "created_at",
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )


def fk(columns, target, name):
    return ForeignKeyConstraint(
        columns,
        target,
        name=name,
        ondelete="RESTRICT",
        onupdate="RESTRICT",
    )


class EntryConfirmation(Base):
    __table__ = Table(
        "entry_confirmation",
        Base.metadata,
        pk(),
        Column("ticket_id", PGUUID, nullable=False),
        Column("event_id", PGUUID, nullable=False),
        Column("attendee_user_id", PGUUID, nullable=False),
        Column("session_id", PGUUID, nullable=False),
        Column("token_hash", Text, nullable=False),
        Column("code_hash", Text, nullable=False),
        Column("signing_key_id", Text, nullable=False),
        Column("expires_at", DateTime(timezone=True), nullable=False),
        Column("consumed_at", DateTime(timezone=True), nullable=True),
        Column("revoked_at", DateTime(timezone=True), nullable=True),
        created(),
        CheckConstraint("expires_at > created_at", name="entry_confirmation_ck1"),
        UniqueConstraint("token_hash", name="entry_confirmation_uq1"),
        UniqueConstraint("id", "ticket_id", "event_id", name="entry_confirmation_uq2"),
        fk(
            ["ticket_id", "event_id"],
            ["biletflow.ticket.id", "biletflow.ticket.event_id"],
            "fk_entry_confirmation_ticket",
        ),
        fk(["attendee_user_id"], ["biletflow.app_user.id"], "fk_entry_confirmation_attendee"),
        fk(["session_id"], ["biletflow.auth_session.id"], "fk_entry_confirmation_session"),
    )


Index("ix_entry_confirmation_ticket", EntryConfirmation.ticket_id, EntryConfirmation.created_at)
Index(
    "uq_live_entry_confirmation",
    EntryConfirmation.ticket_id,
    unique=True,
    postgresql_where=EntryConfirmation.consumed_at.is_(None)
    & EntryConfirmation.revoked_at.is_(None),
)


class ScannerDevice(Base):
    __table__ = Table(
        "scanner_device",
        Base.metadata,
        pk(),
        Column("owner_user_id", PGUUID, nullable=False),
        Column("device_key", Text, nullable=False),
        Column("label", Text, nullable=False),
        Column("revoked_at", DateTime(timezone=True), nullable=True),
        created(),
        CheckConstraint("length(btrim(label)) > 0", name="scanner_device_ck1"),
        UniqueConstraint("device_key", name="scanner_device_uq1"),
        UniqueConstraint("id", "owner_user_id", name="scanner_device_uq2"),
        fk(["owner_user_id"], ["biletflow.app_user.id"], "fk_scanner_device_owner"),
    )


class OfflinePackage(Base):
    __table__ = Table(
        "offline_package",
        Base.metadata,
        pk(),
        Column("event_id", PGUUID, nullable=False),
        Column("scanner_user_id", PGUUID, nullable=False),
        Column("session_id", PGUUID, nullable=False),
        Column("device_id", PGUUID, nullable=False),
        Column("snapshot_version", BigInteger, nullable=False),
        Column("expires_at", DateTime(timezone=True), nullable=False),
        Column("content_hash", Text, nullable=False),
        Column("signing_key_id", Text, nullable=False),
        Column("revoked_at", DateTime(timezone=True), nullable=True),
        created(),
        CheckConstraint("snapshot_version >= 0", name="offline_package_ck1"),
        CheckConstraint("expires_at > created_at", name="offline_package_ck2"),
        UniqueConstraint("id", "event_id", "device_id", name="offline_package_uq1"),
        fk(["session_id"], ["biletflow.auth_session.id"], "fk_offline_package_session"),
        fk(
            ["device_id", "scanner_user_id"],
            ["biletflow.scanner_device.id", "biletflow.scanner_device.owner_user_id"],
            "fk_offline_package_device",
        ),
        fk(["event_id"], ["biletflow.event.id"], "fk_offline_package_event"),
    )


class OfflineOperation(Base):
    __table__ = Table(
        "offline_operation",
        Base.metadata,
        pk(),
        Column("package_id", PGUUID, nullable=False),
        Column("event_id", PGUUID, nullable=False),
        Column("device_id", PGUUID, nullable=False),
        Column("operation_id", PGUUID, nullable=False),
        Column("sequence_number", BigInteger, nullable=False),
        Column("kind", Text, nullable=False),
        Column("claimed_ticket_id", PGUUID, nullable=True),
        Column("claimed_confirmation_id", PGUUID, nullable=True),
        Column("parent_operation_id", PGUUID, nullable=True),
        Column("reason", Text, nullable=True),
        Column("captured_at", DateTime(timezone=True), nullable=False),
        Column("device_reported_at", DateTime(timezone=True), nullable=True),
        Column("payload_hash", Text, nullable=False),
        Column("status", Text, nullable=False, server_default=text("'received'")),
        Column("resolved_ticket_id", PGUUID, nullable=True),
        Column("accepted_check_in_id", PGUUID, nullable=True),
        Column("rejection_code", Text, nullable=True),
        Column("processed_at", DateTime(timezone=True), nullable=True),
        created(),
        CheckConstraint("sequence_number > 0", name="offline_operation_ck1"),
        CheckConstraint("kind IN ('check_in','reverse')", name="offline_operation_ck2"),
        CheckConstraint(
            "status IN ('received','accepted','duplicate','rejected','conflict')",
            name="offline_operation_ck3",
        ),
        CheckConstraint(
            "(kind = 'reverse') = (parent_operation_id IS NOT NULL)", name="offline_operation_ck4"
        ),
        CheckConstraint(
            "status = 'received' OR processed_at IS NOT NULL", name="offline_operation_ck5"
        ),
        UniqueConstraint("device_id", "operation_id", name="offline_operation_uq1"),
        UniqueConstraint("package_id", "sequence_number", name="offline_operation_uq2"),
        fk(
            ["package_id", "event_id", "device_id"],
            [
                "biletflow.offline_package.id",
                "biletflow.offline_package.event_id",
                "biletflow.offline_package.device_id",
            ],
            "fk_offline_operation_package",
        ),
        fk(
            ["resolved_ticket_id", "event_id"],
            ["biletflow.ticket.id", "biletflow.ticket.event_id"],
            "fk_offline_operation_ticket",
        ),
        fk(["accepted_check_in_id"], ["biletflow.check_in.id"], "fk_offline_operation_check_in"),
    )


Index(
    "ix_offline_operation_event",
    OfflineOperation.event_id,
    OfflineOperation.status,
    OfflineOperation.created_at,
)


class SyncConflict(Base):
    __table__ = Table(
        "sync_conflict",
        Base.metadata,
        pk(),
        Column("offline_operation_id", PGUUID, nullable=False),
        Column("existing_check_in_id", PGUUID, nullable=True),
        Column("status", Text, nullable=False, server_default=text("'open'")),
        Column("reason", Text, nullable=False),
        Column("resolved_by_user_id", PGUUID, nullable=True),
        Column("resolution_note", Text, nullable=True),
        Column("resolved_at", DateTime(timezone=True), nullable=True),
        created(),
        CheckConstraint("status IN ('open','resolved')", name="sync_conflict_ck1"),
        CheckConstraint(
            "status <> 'resolved' OR (resolved_by_user_id IS NOT NULL AND resolved_at IS NOT NULL"
            " AND resolution_note IS NOT NULL)",
            name="sync_conflict_ck2",
        ),
        UniqueConstraint("offline_operation_id", name="sync_conflict_uq1"),
        fk(
            ["offline_operation_id"],
            ["biletflow.offline_operation.id"],
            "fk_sync_conflict_operation",
        ),
        fk(["existing_check_in_id"], ["biletflow.check_in.id"], "fk_sync_conflict_check_in"),
        fk(["resolved_by_user_id"], ["biletflow.app_user.id"], "fk_sync_conflict_resolver"),
    )
