"""BF-22 (#78): durable job backlog read for the protected operational metrics view."""

from sqlalchemy import and_, func, select

from .models import OutboxJob
from .notification_models import NotificationDelivery
from .security import now

OPEN = ("pending", "leased", "dead")


def _age(current, oldest):
    return round((current - oldest).total_seconds(), 3) if oldest else None


def job_metrics(db):
    current = now()
    pending = OutboxJob.status == "pending"
    leased = OutboxJob.status == "leased"
    dead = OutboxJob.status == "dead"
    ready = and_(pending, OutboxJob.available_at <= current)
    outbox = db.execute(
        select(
            func.count().filter(pending),
            func.count().filter(ready),
            func.count().filter(and_(pending, OutboxJob.attempt_count > 0)),
            func.count().filter(leased),
            func.count().filter(and_(leased, OutboxJob.lease_until <= current)),
            func.count().filter(dead),
            func.min(OutboxJob.available_at).filter(ready),
        ).where(OutboxJob.status.in_(OPEN))
    ).one()
    kinds = db.execute(
        select(
            OutboxJob.kind,
            func.count().filter(pending),
            func.count().filter(leased),
            func.count().filter(dead),
        )
        .where(OutboxJob.status.in_(OPEN))
        .group_by(OutboxJob.kind)
        .order_by(OutboxJob.kind)
    ).all()
    email = NotificationDelivery.channel == "email"
    waiting = and_(email, NotificationDelivery.status == "pending")
    due = and_(waiting, NotificationDelivery.next_attempt_at <= current)
    deliveries = db.execute(
        select(
            func.count().filter(waiting),
            func.count().filter(due),
            func.count().filter(and_(email, NotificationDelivery.status == "failed")),
            func.min(NotificationDelivery.next_attempt_at).filter(due),
        ).where(NotificationDelivery.status.in_(("pending", "failed")))
    ).one()
    return {
        "outbox": {
            "pending": outbox[0],
            "ready": outbox[1],
            "retrying": outbox[2],
            "leased": outbox[3],
            "expired_leases": outbox[4],
            "dead": outbox[5],
            "oldest_ready_age_seconds": _age(current, outbox[6]),
        },
        "outbox_by_kind": [
            {"kind": kind, "pending": p, "leased": leased_count, "dead": d}
            for kind, p, leased_count, d in kinds
        ],
        "notification_email": {
            "pending": deliveries[0],
            "ready": deliveries[1],
            "failed": deliveries[2],
            "oldest_ready_age_seconds": _age(current, deliveries[3]),
        },
    }
