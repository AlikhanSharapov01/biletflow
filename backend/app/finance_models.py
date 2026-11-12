"""Simulation payout reservations and append-only payout/adjustment history."""

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
from sqlalchemy.dialects.postgresql import UUID

from .models import Base


def identifier():
    return Column("id", UUID, primary_key=True, server_default=text("gen_random_uuid()"))


def created():
    return Column(
        "created_at",
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )


class DemoPayout(Base):
    __table__ = Table(
        "demo_payout",
        Base.metadata,
        identifier(),
        Column("event_id", UUID, nullable=False),
        Column("organization_id", UUID, nullable=False),
        Column("payout_profile_id", UUID, nullable=False),
        Column("requested_by_user_id", UUID, nullable=False),
        Column("request_key", Text, nullable=False),
        Column("amount_minor", BigInteger, nullable=False),
        Column("currency", Text, nullable=False, server_default="KZT"),
        Column("environment", Text, nullable=False, server_default="simulation"),
        Column("status", Text, nullable=False, server_default="pending"),
        Column("sent_at", DateTime(timezone=True)),
        created(),
        UniqueConstraint("id", "event_id", name="demo_payout_scope"),
        UniqueConstraint("requested_by_user_id", "request_key", name="demo_payout_request"),
        CheckConstraint(
            "amount_minor > 0 AND currency = 'KZT' AND environment = 'simulation'",
            name="demo_payout_money",
        ),
        CheckConstraint(
            "status IN ('pending','eligible','sent','failed') AND ((status = 'sent') = (sent_at IS NOT NULL))",
            name="demo_payout_state",
        ),
        ForeignKeyConstraint(
            ["event_id", "organization_id"],
            ["biletflow.event.id", "biletflow.event.organization_id"],
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["payout_profile_id", "organization_id"],
            ["biletflow.payout_profile.id", "biletflow.payout_profile.organization_id"],
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["requested_by_user_id"],
            ["biletflow.app_user.id"],
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
    )


class FinanceEntry(Base):
    __table__ = Table(
        "finance_entry",
        Base.metadata,
        identifier(),
        Column("event_id", UUID, nullable=False),
        Column("payout_id", UUID, nullable=False),
        Column("refund_id", UUID),
        Column("kind", Text, nullable=False),
        Column("amount_minor", BigInteger, nullable=False),
        Column("environment", Text, nullable=False, server_default="simulation"),
        created(),
        UniqueConstraint("payout_id", "kind", "refund_id", name="finance_entry_adjustment"),
        CheckConstraint(
            "environment='simulation' AND ((kind='payout' AND amount_minor<0 AND refund_id IS NULL) OR (kind='refund' AND amount_minor<0 AND refund_id IS NOT NULL) OR (kind='fee_reversal' AND amount_minor>=0 AND refund_id IS NOT NULL) OR (kind='activation_refund' AND amount_minor>0 AND refund_id IS NOT NULL))",
            name="finance_entry_money",
        ),
        ForeignKeyConstraint(
            ["payout_id", "event_id"],
            ["biletflow.demo_payout.id", "biletflow.demo_payout.event_id"],
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["refund_id", "event_id"],
            ["biletflow.refund.id", "biletflow.refund.event_id"],
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
    )


Index("ix_demo_payout_event", DemoPayout.event_id, DemoPayout.created_at, DemoPayout.id)
Index(
    "uq_finance_payout_debit",
    FinanceEntry.payout_id,
    unique=True,
    postgresql_where=FinanceEntry.kind == "payout",
)
Index(
    "uq_finance_refund_effect",
    FinanceEntry.refund_id,
    FinanceEntry.kind,
    unique=True,
    postgresql_where=FinanceEntry.refund_id.is_not(None),
)
