"""Commerce tables owned by the checkout/payments package (migrations 0010 and later).

Every financial row here is a simulation or provider-sandbox record; no card data is stored.
"""

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKeyConstraint,
    Index,
    Integer,
    LargeBinary,
    Table,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID

from .catalog_models import Hold
from .models import Base

# Background expiry scans active holds by deadline across all events.
Index("ix_hold_expiry", Hold.expires_at, postgresql_where=Hold.status == "active")


def _id():
    return Column(
        "id", PGUUID, nullable=False, primary_key=True, server_default=text("gen_random_uuid()")
    )


def _created():
    return Column(
        "created_at",
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )


def _fk(columns, targets, name, **extra):
    return ForeignKeyConstraint(
        columns, targets, name=name, ondelete="RESTRICT", onupdate="RESTRICT", **extra
    )


class IdempotencyRecord(Base):
    # Completed outcomes only: a row is written in the same commit as the result it names.
    __table__ = Table(
        "idempotency_record",
        Base.metadata,
        _id(),
        Column("actor_user_id", PGUUID, nullable=False),
        Column("operation", Text, nullable=False),
        Column("request_key", Text, nullable=False),
        Column("request_hash", Text, nullable=False),
        Column("resource_type", Text, nullable=False),
        Column("resource_id", PGUUID, nullable=False),
        Column("response_code", Integer, nullable=False),
        Column("expires_at", DateTime(timezone=True), nullable=False),
        _created(),
        UniqueConstraint(
            "actor_user_id", "operation", "request_key", name="idempotency_record_uq1"
        ),
        CheckConstraint("response_code BETWEEN 200 AND 299", name="idempotency_record_ck1"),
        CheckConstraint("expires_at > created_at", name="idempotency_record_ck2"),
        CheckConstraint(
            "char_length(request_key) BETWEEN 8 AND 128", name="idempotency_record_ck3"
        ),
        _fk(["actor_user_id"], ["biletflow.app_user.id"], "fk_idempotency_record_actor"),
    )


class PayoutProfile(Base):
    __table__ = Table(
        "payout_profile",
        Base.metadata,
        _id(),
        Column("organization_id", PGUUID, nullable=False),
        Column("environment", Text, nullable=False, server_default=text("'simulation'")),
        Column("provider", Text, nullable=False),
        Column("provider_reference", Text, nullable=True),
        Column("encrypted_details", LargeBinary, nullable=True),
        Column("status", Text, nullable=False, server_default=text("'pending'")),
        Column("verified_at", DateTime(timezone=True), nullable=True),
        _created(),
        UniqueConstraint("id", "organization_id", name="payout_profile_uq1"),
        CheckConstraint("environment IN ('simulation','sandbox')", name="payout_profile_ck1"),
        CheckConstraint("status IN ('pending','verified','rejected')", name="payout_profile_ck2"),
        CheckConstraint(
            "status <> 'verified' OR verified_at IS NOT NULL", name="payout_profile_ck3"
        ),
        _fk(["organization_id"], ["biletflow.organization.id"], "fk_payout_profile_org"),
    )


class VerificationRecord(Base):
    __table__ = Table(
        "verification_record",
        Base.metadata,
        _id(),
        Column("organization_id", PGUUID, nullable=False),
        Column("submitted_by_user_id", PGUUID, nullable=False),
        Column("reviewed_by_user_id", PGUUID, nullable=True),
        Column("environment", Text, nullable=False, server_default=text("'simulation'")),
        Column("status", Text, nullable=False, server_default=text("'pending'")),
        Column("reviewed_at", DateTime(timezone=True), nullable=True),
        Column("reason", Text, nullable=True),
        _created(),
        UniqueConstraint("id", "organization_id", name="verification_record_uq1"),
        CheckConstraint("environment IN ('simulation','sandbox')", name="verification_record_ck1"),
        CheckConstraint(
            "status IN ('pending','approved','rejected')", name="verification_record_ck2"
        ),
        CheckConstraint(
            "status = 'pending' OR reviewed_at IS NOT NULL", name="verification_record_ck3"
        ),
        _fk(["organization_id"], ["biletflow.organization.id"], "fk_verification_record_org"),
        _fk(
            ["submitted_by_user_id"],
            ["biletflow.app_user.id"],
            "fk_verification_record_submitter",
        ),
        _fk(["reviewed_by_user_id"], ["biletflow.app_user.id"], "fk_verification_record_reviewer"),
    )


class TermsAcceptance(Base):
    __table__ = Table(
        "terms_acceptance",
        Base.metadata,
        _id(),
        Column("event_id", PGUUID, nullable=False),
        Column("accepted_by_user_id", PGUUID, nullable=False),
        Column("terms_version", Text, nullable=False),
        Column("terms_hash", Text, nullable=False),
        _created(),
        UniqueConstraint(
            "event_id", "terms_version", "accepted_by_user_id", name="terms_acceptance_uq1"
        ),
        UniqueConstraint("id", "event_id", name="terms_acceptance_uq2"),
        _fk(["event_id"], ["biletflow.event.id"], "fk_terms_acceptance_event"),
        _fk(["accepted_by_user_id"], ["biletflow.app_user.id"], "fk_terms_acceptance_user"),
    )


class SalesActivation(Base):
    __table__ = Table(
        "sales_activation",
        Base.metadata,
        _id(),
        Column("event_id", PGUUID, nullable=False),
        Column("organization_id", PGUUID, nullable=False),
        Column("payout_profile_id", PGUUID, nullable=True),
        Column("verification_record_id", PGUUID, nullable=True),
        Column("terms_acceptance_id", PGUUID, nullable=True),
        Column("status", Text, nullable=False, server_default=text("'incomplete'")),
        Column("activation_fee_minor", BigInteger, nullable=False, server_default=text("500000")),
        Column("currency", Text, nullable=False, server_default=text("'KZT'")),
        Column("paid_attempt_id", PGUUID, nullable=True),
        Column("activated_at", DateTime(timezone=True), nullable=True),
        Column("suspension_reason", Text, nullable=True),
        _created(),
        UniqueConstraint("event_id", name="sales_activation_uq1"),
        UniqueConstraint("paid_attempt_id", name="sales_activation_uq2"),
        UniqueConstraint("id", "event_id", name="sales_activation_uq3"),
        CheckConstraint(
            "status IN ('incomplete','pending','active','failed','suspended')",
            name="sales_activation_ck1",
        ),
        CheckConstraint(
            "activation_fee_minor > 0 AND currency = 'KZT'", name="sales_activation_ck2"
        ),
        CheckConstraint(
            "status <> 'active' OR (payout_profile_id IS NOT NULL AND verification_record_id "
            "IS NOT NULL AND terms_acceptance_id IS NOT NULL AND paid_attempt_id IS NOT NULL "
            "AND activated_at IS NOT NULL)",
            name="sales_activation_ck3",
        ),
        CheckConstraint(
            "status <> 'suspended' OR suspension_reason IS NOT NULL", name="sales_activation_ck4"
        ),
        _fk(
            ["event_id", "organization_id"],
            ["biletflow.event.id", "biletflow.event.organization_id"],
            "fk_sales_activation_event",
        ),
        _fk(
            ["payout_profile_id", "organization_id"],
            ["biletflow.payout_profile.id", "biletflow.payout_profile.organization_id"],
            "fk_sales_activation_payout",
        ),
        _fk(
            ["verification_record_id", "organization_id"],
            ["biletflow.verification_record.id", "biletflow.verification_record.organization_id"],
            "fk_sales_activation_verification",
        ),
        _fk(
            ["terms_acceptance_id", "event_id"],
            ["biletflow.terms_acceptance.id", "biletflow.terms_acceptance.event_id"],
            "fk_sales_activation_terms",
        ),
        _fk(
            ["paid_attempt_id", "event_id"],
            ["biletflow.payment_attempt.id", "biletflow.payment_attempt.event_id"],
            "fk_sales_activation_paid_attempt",
            use_alter=True,
        ),
    )


class PaymentIntent(Base):
    __table__ = Table(
        "payment_intent",
        Base.metadata,
        _id(),
        Column("event_id", PGUUID, nullable=False),
        Column("order_id", PGUUID, nullable=True),
        Column("activation_id", PGUUID, nullable=True),
        Column("payer_user_id", PGUUID, nullable=False),
        Column("purpose", Text, nullable=False),
        Column("expected_minor", BigInteger, nullable=False),
        Column("currency", Text, nullable=False, server_default=text("'KZT'")),
        Column("environment", Text, nullable=False, server_default=text("'simulation'")),
        _created(),
        UniqueConstraint("order_id", name="payment_intent_uq1"),
        UniqueConstraint("activation_id", name="payment_intent_uq2"),
        UniqueConstraint("id", "event_id", "environment", name="payment_intent_uq3"),
        CheckConstraint(
            "(purpose = 'ticket_order' AND order_id IS NOT NULL AND activation_id IS NULL) OR "
            "(purpose = 'activation' AND activation_id IS NOT NULL AND order_id IS NULL)",
            name="payment_intent_ck1",
        ),
        CheckConstraint("expected_minor > 0", name="payment_intent_ck2"),
        CheckConstraint("currency = 'KZT'", name="payment_intent_ck3"),
        CheckConstraint("environment IN ('simulation','sandbox')", name="payment_intent_ck4"),
        _fk(["event_id"], ["biletflow.event.id"], "fk_payment_intent_event"),
        _fk(
            ["order_id", "event_id"],
            ["biletflow.ticket_order.id", "biletflow.ticket_order.event_id"],
            "fk_payment_intent_order",
        ),
        _fk(
            ["activation_id", "event_id"],
            ["biletflow.sales_activation.id", "biletflow.sales_activation.event_id"],
            "fk_payment_intent_activation",
        ),
        _fk(["payer_user_id"], ["biletflow.app_user.id"], "fk_payment_intent_payer"),
    )


class PaymentAttempt(Base):
    __table__ = Table(
        "payment_attempt",
        Base.metadata,
        _id(),
        Column("intent_id", PGUUID, nullable=False),
        Column("event_id", PGUUID, nullable=False),
        Column("environment", Text, nullable=False),
        Column("provider", Text, nullable=False),
        Column("merchant_account_key", Text, nullable=False),
        Column("provider_payment_id", Text, nullable=True),
        Column("request_key", Text, nullable=False),
        Column("status", Text, nullable=False, server_default=text("'created'")),
        Column("charged_minor", BigInteger, nullable=False, server_default=text("0")),
        Column("processing_fee_minor", BigInteger, nullable=False, server_default=text("0")),
        Column("confirmed_at", DateTime(timezone=True), nullable=True),
        Column("next_reconcile_at", DateTime(timezone=True), nullable=True),
        Column("safe_result", JSONB, nullable=False, server_default=text("'{}'::jsonb")),
        _created(),
        UniqueConstraint(
            "provider",
            "environment",
            "merchant_account_key",
            "provider_payment_id",
            name="payment_attempt_uq1",
        ),
        UniqueConstraint(
            "provider",
            "environment",
            "merchant_account_key",
            "request_key",
            name="payment_attempt_uq2",
        ),
        UniqueConstraint("id", "event_id", name="payment_attempt_uq3"),
        CheckConstraint(
            "status IN ('created','pending','succeeded','failed')", name="payment_attempt_ck1"
        ),
        CheckConstraint(
            "charged_minor >= 0 AND processing_fee_minor BETWEEN 0 AND charged_minor",
            name="payment_attempt_ck2",
        ),
        CheckConstraint(
            "(status = 'succeeded') = (confirmed_at IS NOT NULL)", name="payment_attempt_ck3"
        ),
        CheckConstraint("status <> 'succeeded' OR charged_minor > 0", name="payment_attempt_ck4"),
        CheckConstraint("jsonb_typeof(safe_result) = 'object'", name="payment_attempt_ck5"),
        _fk(
            ["intent_id", "event_id", "environment"],
            [
                "biletflow.payment_intent.id",
                "biletflow.payment_intent.event_id",
                "biletflow.payment_intent.environment",
            ],
            "fk_payment_attempt_intent",
        ),
    )


class ProviderEvent(Base):
    # Deduplicated inbox of verified provider (or simulator) notifications.
    __table__ = Table(
        "provider_event",
        Base.metadata,
        _id(),
        Column("provider", Text, nullable=False),
        Column("environment", Text, nullable=False),
        Column("merchant_account_key", Text, nullable=False),
        Column("external_event_id", Text, nullable=False),
        Column("payment_attempt_id", PGUUID, nullable=True),
        Column("refund_attempt_id", PGUUID, nullable=True),
        Column("payload_hash", Text, nullable=False),
        Column("safe_payload", JSONB, nullable=False),
        Column("status", Text, nullable=False, server_default=text("'received'")),
        Column("processed_at", DateTime(timezone=True), nullable=True),
        Column("rejection_reason", Text, nullable=True),
        _created(),
        UniqueConstraint(
            "provider",
            "environment",
            "merchant_account_key",
            "external_event_id",
            name="provider_event_uq1",
        ),
        CheckConstraint("environment IN ('simulation','sandbox')", name="provider_event_ck1"),
        CheckConstraint("status IN ('received','processed','rejected')", name="provider_event_ck2"),
        CheckConstraint(
            "num_nonnulls(payment_attempt_id, refund_attempt_id) <= 1", name="provider_event_ck3"
        ),
        CheckConstraint("jsonb_typeof(safe_payload) = 'object'", name="provider_event_ck4"),
        CheckConstraint(
            "status <> 'processed' OR processed_at IS NOT NULL", name="provider_event_ck5"
        ),
        _fk(["payment_attempt_id"], ["biletflow.payment_attempt.id"], "fk_provider_event_payment"),
    )


Index("ix_payment_attempt_intent", PaymentAttempt.intent_id, PaymentAttempt.created_at)
Index("ix_provider_event_attempt", ProviderEvent.payment_attempt_id)
