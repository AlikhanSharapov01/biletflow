"""BF-16 tables: support cases, persisted messages and append-only case history.

Mirrors migrations 0008_support. Every message and case change takes the next per-case `seq`
while the case row is locked; clients resume polling or WebSocket delivery from that cursor.
Attachments are not implemented yet, so stored_file/support_attachment do not exist.
"""

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKeyConstraint,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, Row

CATEGORIES = (
    "delivery",
    "payment",
    "refund",
    "seating",
    "event_info",
    "check_in",
    "account",
    "technical",
)
STATUSES = ("open", "in_progress", "waiting_for_customer", "resolved")


def restrict(columns, target, name):
    return ForeignKeyConstraint(
        columns, target, name=name, ondelete="RESTRICT", onupdate="RESTRICT"
    )


class SupportCase(Row, Base):
    __tablename__ = "support_case"
    __table_args__ = (
        CheckConstraint("case_kind IN ('attendee','organizer_platform')", name="support_case_ck1"),
        CheckConstraint(
            "category IN ('delivery','payment','refund','seating','event_info','check_in','account','technical')",
            name="support_case_ck2",
        ),
        CheckConstraint(
            "status IN ('open','in_progress','waiting_for_customer','resolved')",
            name="support_case_ck3",
        ),
        CheckConstraint(
            "(status = 'resolved') = (resolved_at IS NOT NULL)", name="support_case_ck4"
        ),
        CheckConstraint("order_id IS NULL OR event_id IS NOT NULL", name="support_case_ck5"),
        CheckConstraint("ticket_id IS NULL OR event_id IS NOT NULL", name="support_case_ck6"),
        CheckConstraint("event_id IS NULL OR organization_id IS NOT NULL", name="support_case_ck7"),
        CheckConstraint(
            "case_kind <> 'attendee' OR (event_id IS NOT NULL AND organization_id IS NOT NULL)",
            name="support_case_ck8",
        ),
        CheckConstraint(
            "case_kind <> 'organizer_platform' OR (organization_id IS NOT NULL AND order_id IS NULL AND ticket_id IS NULL AND escalated_at IS NULL)",
            name="support_case_ck9",
        ),
        CheckConstraint("last_seq >= 0", name="support_case_ck10"),
        CheckConstraint("length(btrim(subject)) > 0", name="support_case_ck11"),
        restrict(["organization_id"], ["biletflow.organization.id"], "fk_support_case_org"),
        restrict(
            ["event_id", "organization_id"],
            ["biletflow.event.id", "biletflow.event.organization_id"],
            "fk_support_case_event",
        ),
        restrict(
            ["order_id", "event_id"],
            ["biletflow.ticket_order.id", "biletflow.ticket_order.event_id"],
            "fk_support_case_order",
        ),
        restrict(
            ["ticket_id", "event_id"],
            ["biletflow.ticket.id", "biletflow.ticket.event_id"],
            "fk_support_case_ticket",
        ),
        restrict(["requester_user_id"], ["biletflow.app_user.id"], "fk_support_case_requester"),
        restrict(["assigned_to_user_id"], ["biletflow.app_user.id"], "fk_support_case_assignee"),
    )
    requester_user_id: Mapped[UUID] = mapped_column(PGUUID)
    organization_id: Mapped[UUID | None] = mapped_column(PGUUID)
    event_id: Mapped[UUID | None] = mapped_column(PGUUID)
    order_id: Mapped[UUID | None] = mapped_column(PGUUID)
    ticket_id: Mapped[UUID | None] = mapped_column(PGUUID)
    case_kind: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(Text)
    subject: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, server_default=text("'open'"))
    assigned_to_user_id: Mapped[UUID | None] = mapped_column(PGUUID)
    escalated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_seq: Mapped[int] = mapped_column(BigInteger, server_default=text("0"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP")
    )


class SupportMessage(Row, Base):
    __tablename__ = "support_message"
    __table_args__ = (
        UniqueConstraint(
            "case_id", "author_user_id", "client_message_id", name="support_message_uq1"
        ),
        UniqueConstraint("id", "case_id", name="support_message_uq2"),
        UniqueConstraint("case_id", "seq", name="support_message_uq3"),
        CheckConstraint("length(btrim(body)) > 0", name="support_message_ck1"),
        CheckConstraint("seq > 0", name="support_message_ck2"),
        restrict(["case_id"], ["biletflow.support_case.id"], "fk_support_message_case"),
        restrict(["author_user_id"], ["biletflow.app_user.id"], "fk_support_message_author"),
    )
    case_id: Mapped[UUID] = mapped_column(PGUUID)
    seq: Mapped[int] = mapped_column(BigInteger)
    author_user_id: Mapped[UUID] = mapped_column(PGUUID)
    client_message_id: Mapped[UUID] = mapped_column(PGUUID)
    body: Mapped[str] = mapped_column(Text)


class CaseChange(Row, Base):
    __tablename__ = "case_change"
    __table_args__ = (
        UniqueConstraint("case_id", "seq", name="case_change_uq1"),
        CheckConstraint(
            "change_kind IN ('status','assignment','escalation')", name="case_change_ck1"
        ),
        CheckConstraint("seq > 0", name="case_change_ck2"),
        restrict(["case_id"], ["biletflow.support_case.id"], "fk_case_change_case"),
        restrict(["actor_user_id"], ["biletflow.app_user.id"], "fk_case_change_actor"),
    )
    case_id: Mapped[UUID] = mapped_column(PGUUID)
    seq: Mapped[int] = mapped_column(BigInteger)
    actor_user_id: Mapped[UUID] = mapped_column(PGUUID)
    change_kind: Mapped[str] = mapped_column(Text)
    before_value: Mapped[str | None] = mapped_column(Text)
    after_value: Mapped[str | None] = mapped_column(Text)
    reason: Mapped[str | None] = mapped_column(Text)
