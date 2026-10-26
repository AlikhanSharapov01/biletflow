"""Commerce tables owned by the checkout/payments package (migrations 0010 and later)."""

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
from sqlalchemy.dialects.postgresql import UUID as PGUUID

from .catalog_models import Hold
from .models import Base

# Background expiry scans active holds by deadline across all events.
Index("ix_hold_expiry", Hold.expires_at, postgresql_where=Hold.status == "active")


class IdempotencyRecord(Base):
    # Completed outcomes only: a row is written in the same commit as the result it names.
    __table__ = Table(
        "idempotency_record",
        Base.metadata,
        Column(
            "id", PGUUID, nullable=False, primary_key=True, server_default=text("gen_random_uuid()")
        ),
        Column("actor_user_id", PGUUID, nullable=False),
        Column("operation", Text, nullable=False),
        Column("request_key", Text, nullable=False),
        Column("request_hash", Text, nullable=False),
        Column("resource_type", Text, nullable=False),
        Column("resource_id", PGUUID, nullable=False),
        Column("response_code", Integer, nullable=False),
        Column("expires_at", DateTime(timezone=True), nullable=False),
        Column(
            "created_at",
            DateTime(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        ),
        UniqueConstraint(
            "actor_user_id", "operation", "request_key", name="idempotency_record_uq1"
        ),
        CheckConstraint("response_code BETWEEN 200 AND 299", name="idempotency_record_ck1"),
        CheckConstraint("expires_at > created_at", name="idempotency_record_ck2"),
        CheckConstraint(
            "char_length(request_key) BETWEEN 8 AND 128", name="idempotency_record_ck3"
        ),
        ForeignKeyConstraint(
            ["actor_user_id"],
            ["biletflow.app_user.id"],
            name="fk_idempotency_record_actor",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
    )
