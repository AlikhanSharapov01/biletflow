"""Allowlisted operational commerce reads; no provider payloads or payment mutations."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import Query
from sqlalchemy import select

from .catalog_models import Event
from .commerce_models import PaymentAttempt, PaymentIntent, Refund, RefundAttempt
from .security import fail

COMMERCE_KINDS = ("payments", "failed-payments", "refunds")


def commerce_filters(
    status: str | None = Query(None, max_length=32),
    event_id: UUID | None = None,
    organization_id: UUID | None = None,
    order_id: UUID | None = None,
    payer_user_id: UUID | None = None,
    purpose: Literal["ticket_order", "activation"] | None = None,
    environment: Literal["simulation", "sandbox"] | None = None,
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = None,
):
    if any(value and value.tzinfo is None for value in (from_, to)):
        fail("invalid_date_range", 422)
    if from_ and to and from_ >= to:
        fail("invalid_date_range", 422)
    return dict(
        status=status,
        event_id=event_id,
        organization_id=organization_id,
        order_id=order_id,
        payer_user_id=payer_user_id,
        purpose=purpose,
        environment=environment,
        from_=from_,
        to=to,
    )


def commerce_query(
    kind,
    status=None,
    event_id=None,
    organization_id=None,
    order_id=None,
    payer_user_id=None,
    purpose=None,
    environment=None,
    from_=None,
    to=None,
    **_,
):
    is_refund = kind == "refunds"
    allowed = (
        ("requested", "pending", "failed", "succeeded")
        if is_refund
        else (
            ("failed",)
            if kind == "failed-payments"
            else ("created", "pending", "failed", "succeeded")
        )
    )
    if status and status not in allowed:
        fail("invalid_filter", 422)
    common = [
        PaymentIntent.id.label("intent_id"),
        PaymentIntent.order_id,
        PaymentIntent.activation_id,
        PaymentIntent.payer_user_id,
        PaymentIntent.purpose,
        PaymentIntent.expected_minor,
        PaymentIntent.currency,
        PaymentAttempt.environment,
        (PaymentAttempt.environment == "simulation").label("simulated"),
        PaymentAttempt.provider,
        PaymentAttempt.provider_payment_id,
        Event.organization_id,
    ]
    if is_refund:
        latest = (
            select(RefundAttempt.status)
            .where(RefundAttempt.refund_id == Refund.id)
            .order_by(RefundAttempt.attempt_number.desc())
            .limit(1)
            .scalar_subquery()
        )
        query = select(
            Refund.id,
            Refund.event_id,
            Refund.payment_attempt_id,
            Refund.status,
            Refund.reason,
            Refund.amount_minor,
            Refund.created_at,
            Refund.succeeded_at,
            latest.label("latest_attempt_status"),
            *common,
        ).join(PaymentAttempt, PaymentAttempt.id == Refund.payment_attempt_id)
        record = Refund
    else:
        query = select(
            PaymentAttempt.id,
            PaymentAttempt.event_id,
            PaymentAttempt.status,
            PaymentAttempt.charged_minor,
            PaymentAttempt.processing_fee_minor,
            PaymentAttempt.created_at,
            PaymentAttempt.confirmed_at,
            PaymentAttempt.next_reconcile_at,
            *common,
        )
        record = PaymentAttempt
    query = query.join(PaymentIntent, PaymentIntent.id == PaymentAttempt.intent_id).join(
        Event, Event.id == PaymentAttempt.event_id
    )
    if kind == "failed-payments":
        query = query.where(PaymentAttempt.status == "failed")
    for column, value in (
        (record.status, status),
        (record.event_id, event_id),
        (Event.organization_id, organization_id),
        (PaymentIntent.order_id, order_id),
        (PaymentIntent.payer_user_id, payer_user_id),
        (PaymentIntent.purpose, purpose),
        (PaymentAttempt.environment, environment),
    ):
        if value is not None:
            query = query.where(column == value)
    if from_:
        query = query.where(record.created_at >= from_)
    if to:
        query = query.where(record.created_at < to)
    return query, (record.created_at.desc(), record.id)


def payments_query(**filters):
    return commerce_query("payments", **filters)


def failed_payments_query(**filters):
    return commerce_query("failed-payments", **filters)


def refunds_query(**filters):
    return commerce_query("refunds", **filters)
