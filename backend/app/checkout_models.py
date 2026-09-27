"""Stage C tables: checkout confirmation, orders and issued tickets.

Foreign keys to payment_attempt and stored_file are deferred: those tables
belong to the paid-checkout and PDF-storage stages and do not exist yet.
The columns are kept (nullable) so this migration does not need to change
again once those stages land — only the FK constraint will be added then.
"""

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKeyConstraint,
    Integer,
    Table,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID

from .models import Base


class TicketOrder(Base):
    __table__ = Table(
        "ticket_order",
        Base.metadata,
        Column("id", PGUUID, nullable=False, primary_key=True, server_default=text("gen_random_uuid()")),
        Column("event_id", PGUUID, nullable=False),
        Column("buyer_user_id", PGUUID, nullable=False),
        Column("hold_id", PGUUID, nullable=False),
        Column("status", Text, nullable=False, server_default=text("'pending'")),
        Column("currency", Text, nullable=False, server_default=text("'KZT'")),
        Column("gross_minor", BigInteger, nullable=False),
        Column("discount_minor", BigInteger, nullable=False, server_default=text("0")),
        Column("payable_minor", BigInteger, nullable=False),
        Column("processing_fee_minor", BigInteger, nullable=False, server_default=text("0")),
        Column("processing_rate_bps", Integer, nullable=False, server_default=text("300")),
        Column("policy_snapshot", JSONB, nullable=False),
        Column("event_snapshot", JSONB, nullable=False),
        Column("quote_expires_at", DateTime(timezone=True), nullable=False),
        Column("confirmed_at", DateTime(timezone=True), nullable=True),
        Column("fulfillment_payment_attempt_id", PGUUID, nullable=True),  # FK added when payment_attempt exists
        Column("created_at", DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")),
        CheckConstraint(
            "status IN ('pending','confirmed','failed','expired','cancelled','refund_pending','refunded')",
            name="ticket_order_ck1",
        ),
        CheckConstraint("currency = 'KZT'", name="ticket_order_ck2"),
        CheckConstraint("gross_minor >= 0 AND discount_minor BETWEEN 0 AND gross_minor", name="ticket_order_ck3"),
        CheckConstraint("payable_minor = gross_minor - discount_minor", name="ticket_order_ck4"),
        CheckConstraint("processing_fee_minor BETWEEN 0 AND payable_minor", name="ticket_order_ck5"),
        CheckConstraint("processing_rate_bps BETWEEN 0 AND 10000", name="ticket_order_ck6"),
        CheckConstraint(
            "jsonb_typeof(policy_snapshot) = 'object' AND jsonb_typeof(event_snapshot) = 'object'",
            name="ticket_order_ck7",
        ),
        CheckConstraint(
            "status NOT IN ('confirmed','refund_pending','refunded') OR confirmed_at IS NOT NULL",
            name="ticket_order_ck8",
        ),
        CheckConstraint(
            "confirmed_at IS NULL OR ((payable_minor = 0 AND fulfillment_payment_attempt_id IS NULL) "
            "OR (payable_minor > 0 AND fulfillment_payment_attempt_id IS NOT NULL))",
            name="ticket_order_ck9",
        ),
        UniqueConstraint("hold_id", name="ticket_order_uq1"),
        UniqueConstraint("fulfillment_payment_attempt_id", name="ticket_order_uq2"),
        UniqueConstraint("id", "event_id", name="ticket_order_uq3"),
        UniqueConstraint("id", "event_id", "hold_id", name="ticket_order_uq4"),
        ForeignKeyConstraint(
            ["hold_id", "event_id", "buyer_user_id"],
            ["biletflow.checkout_hold.id", "biletflow.checkout_hold.event_id", "biletflow.checkout_hold.buyer_user_id"],
            name="fk_ticket_order_020",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
    )


class OrderItem(Base):
    __table__ = Table(
        "order_item",
        Base.metadata,
        Column("id", PGUUID, nullable=False, primary_key=True, server_default=text("gen_random_uuid()")),
        Column("order_id", PGUUID, nullable=False),
        Column("event_id", PGUUID, nullable=False),
        Column("hold_id", PGUUID, nullable=False),
        Column("ticket_type_id", PGUUID, nullable=False),
        Column("allocation_id", PGUUID, nullable=False),
        Column("unit_number", Integer, nullable=False),
        Column("ticket_type_name", Text, nullable=False),
        Column("recipient_name", Text, nullable=False),
        Column("recipient_email", Text, nullable=False),
        Column("face_value_minor", BigInteger, nullable=False),
        Column("discount_minor", BigInteger, nullable=False, server_default=text("0")),
        Column("paid_minor", BigInteger, nullable=False),
        Column("processing_fee_minor", BigInteger, nullable=False, server_default=text("0")),
        Column("seat_snapshot", JSONB, nullable=True),
        Column("created_at", DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")),
        CheckConstraint("unit_number > 0", name="order_item_ck1"),
        CheckConstraint("recipient_email = lower(btrim(recipient_email))", name="order_item_ck2"),
        CheckConstraint("face_value_minor >= 0 AND discount_minor BETWEEN 0 AND face_value_minor", name="order_item_ck3"),
        CheckConstraint("paid_minor = face_value_minor - discount_minor", name="order_item_ck4"),
        CheckConstraint("processing_fee_minor BETWEEN 0 AND paid_minor", name="order_item_ck5"),
        CheckConstraint("seat_snapshot IS NULL OR jsonb_typeof(seat_snapshot) = 'object'", name="order_item_ck6"),
        UniqueConstraint("allocation_id", name="order_item_uq1"),
        UniqueConstraint("order_id", "unit_number", name="order_item_uq2"),
        UniqueConstraint("id", "event_id", name="order_item_uq3"),
        ForeignKeyConstraint(
            ["order_id", "event_id", "hold_id"],
            ["biletflow.ticket_order.id", "biletflow.ticket_order.event_id", "biletflow.ticket_order.hold_id"],
            name="fk_order_item_022",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["allocation_id", "event_id", "hold_id", "ticket_type_id"],
            [
                "biletflow.inventory_allocation.id",
                "biletflow.inventory_allocation.event_id",
                "biletflow.inventory_allocation.hold_id",
                "biletflow.inventory_allocation.ticket_type_id",
            ],
            name="fk_order_item_023",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
    )


class Ticket(Base):
    __table__ = Table(
        "ticket",
        Base.metadata,
        Column("id", PGUUID, nullable=False, primary_key=True, server_default=text("gen_random_uuid()")),
        Column("event_id", PGUUID, nullable=False),
        Column("order_item_id", PGUUID, nullable=False),
        Column("recipient_user_id", PGUUID, nullable=True),
        Column("status", Text, nullable=False, server_default=text("'valid'")),
        Column("qr_token_hash", Text, nullable=False),
        Column("token_version", Integer, nullable=False, server_default=text("1")),
        Column("claimed_at", DateTime(timezone=True), nullable=True),
        Column("issued_at", DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")),
        Column("pdf_file_id", PGUUID, nullable=True),  # FK added when stored_file exists
        Column("created_at", DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")),
        CheckConstraint("status IN ('valid','checked_in','refund_pending','refunded','cancelled')", name="ticket_ck1"),
        CheckConstraint("token_version > 0", name="ticket_ck2"),
        CheckConstraint("(recipient_user_id IS NULL) = (claimed_at IS NULL)", name="ticket_ck3"),
        UniqueConstraint("order_item_id", name="ticket_uq1"),
        UniqueConstraint("qr_token_hash", name="ticket_uq2"),
        UniqueConstraint("id", "event_id", name="ticket_uq3"),
        ForeignKeyConstraint(
            ["order_item_id", "event_id"],
            ["biletflow.order_item.id", "biletflow.order_item.event_id"],
            name="fk_ticket_041",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["recipient_user_id"],
            ["biletflow.app_user.id"],
            name="fk_ticket_101",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
    )