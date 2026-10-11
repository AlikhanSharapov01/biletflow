"""Stage D tables: online admission (check-in) and its reversal.

Follows check_in / check_in_reversal from docs/database. entry_confirmation_id and
device_id are nullable (set when a confirmation or registered device was used) and, from
0007_entry_offline, reference those tables; operation_id is deduplicated per scanner.
"""

from sqlalchemy import (
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

from . import offline_models  # noqa: F401  (registers tables referenced by foreign keys)
from .models import Base


class CheckIn(Base):
    __table__ = Table(
        "check_in",
        Base.metadata,
        Column(
            "id", PGUUID, nullable=False, primary_key=True, server_default=text("gen_random_uuid()")
        ),
        Column("ticket_id", PGUUID, nullable=False),
        Column("event_id", PGUUID, nullable=False),
        Column("entry_confirmation_id", PGUUID, nullable=True),
        Column("scanner_user_id", PGUUID, nullable=False),
        Column("scanner_session_id", PGUUID, nullable=False),
        Column("device_id", PGUUID, nullable=True),
        Column("operation_id", PGUUID, nullable=False),
        Column("source", Text, nullable=False, server_default=text("'online'")),
        Column(
            "accepted_at",
            DateTime(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        ),
        Column("captured_at", DateTime(timezone=True), nullable=False),
        Column("reversed_at", DateTime(timezone=True), nullable=True),
        Column(
            "created_at",
            DateTime(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        ),
        CheckConstraint("source IN ('online','offline_sync')", name="check_in_ck1"),
        UniqueConstraint("scanner_user_id", "operation_id", name="check_in_uq1"),
        UniqueConstraint("entry_confirmation_id", name="check_in_uq2"),
        UniqueConstraint("id", "ticket_id", "event_id", name="check_in_uq3"),
        ForeignKeyConstraint(
            ["ticket_id", "event_id"],
            ["biletflow.ticket.id", "biletflow.ticket.event_id"],
            name="fk_check_in_ticket",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["scanner_user_id"],
            ["biletflow.app_user.id"],
            name="fk_check_in_scanner",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["entry_confirmation_id", "ticket_id", "event_id"],
            [
                "biletflow.entry_confirmation.id",
                "biletflow.entry_confirmation.ticket_id",
                "biletflow.entry_confirmation.event_id",
            ],
            name="fk_check_in_confirmation",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["device_id", "scanner_user_id"],
            ["biletflow.scanner_device.id", "biletflow.scanner_device.owner_user_id"],
            name="fk_check_in_device",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["scanner_session_id"],
            ["biletflow.auth_session.id"],
            name="fk_check_in_session",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
    )


class CheckInReversal(Base):
    __table__ = Table(
        "check_in_reversal",
        Base.metadata,
        Column(
            "id", PGUUID, nullable=False, primary_key=True, server_default=text("gen_random_uuid()")
        ),
        Column("check_in_id", PGUUID, nullable=False),
        Column("actor_user_id", PGUUID, nullable=False),
        Column("reason", Text, nullable=False),
        Column(
            "created_at",
            DateTime(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        ),
        CheckConstraint("length(btrim(reason)) > 0", name="check_in_reversal_ck1"),
        UniqueConstraint("check_in_id", name="check_in_reversal_uq1"),
        ForeignKeyConstraint(
            ["check_in_id"],
            ["biletflow.check_in.id"],
            name="fk_check_in_reversal_check_in",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["actor_user_id"],
            ["biletflow.app_user.id"],
            name="fk_check_in_reversal_actor",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
    )


# At most one current (not reversed) admission per ticket, even under concurrent scans.
Index(
    "uq_current_check_in",
    CheckIn.ticket_id,
    unique=True,
    postgresql_where=CheckIn.reversed_at.is_(None),
)
Index("ix_check_in_event", CheckIn.event_id, CheckIn.accepted_at)
