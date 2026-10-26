"""One transactional way to close holds, used by requests and the background sweep."""

from uuid import uuid4

from sqlalchemy import select

from .catalog_models import Allocation, Event, Hold
from .catalog_service import changed
from .models import AuditLog
from .security import now

SWEEP_EVENTS = 25


def close_hold(db, hold, status, reason):
    # Caller holds the event lock and the hold row lock. Sold and quarantined rows are
    # never touched: only allocations still in "held" are released.
    current = now()
    hold.status = status
    hold.closed_at = current
    for allocation in db.scalars(
        select(Allocation)
        .where(Allocation.hold_id == hold.id, Allocation.state == "held")
        .order_by(Allocation.id)
        .with_for_update()
    ):
        allocation.state = "released"
        allocation.released_at = current
        allocation.release_reason = reason


def close_expired(db, event):
    """Expire overdue active holds of an event whose row the caller has locked."""
    expired = list(
        db.scalars(
            select(Hold)
            .where(Hold.event_id == event.id, Hold.status == "active", Hold.expires_at <= now())
            .order_by(Hold.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    )
    for hold in expired:
        close_hold(db, hold, "expired", "expired")
    if expired:
        changed(event)
        db.add(
            AuditLog(
                service_actor="hold_expiry",
                organization_id=event.organization_id,
                event_id=event.id,
                action="checkout.holds_expired",
                entity_type="event",
                entity_id=event.id,
                description="checkout.holds_expired",
                safe_change={"holds": len(expired)},
                correlation_id=uuid4(),
            )
        )
    return len(expired)


def sweep_event(factory, event_id):
    """Release one event's expired stock in its own committed transaction."""
    with factory.begin() as db:
        event = db.scalar(
            select(Event)
            .where(Event.id == event_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        return close_expired(db, event) if event else 0


def sweep_expired_holds(factory, limit=SWEEP_EVENTS):
    """Bounded background pass; safe to run from several workers at once."""
    with factory() as db:
        event_ids = list(
            db.scalars(
                select(Hold.event_id)
                .where(Hold.status == "active", Hold.expires_at <= now())
                .group_by(Hold.event_id)
                .order_by(Hold.event_id)
                .limit(limit)
            )
        )
    # Each event is locked and rechecked separately, so a concurrent sweeper or request
    # that got there first simply finds nothing left to release.
    return sum(sweep_event(factory, event_id) for event_id in event_ids)
