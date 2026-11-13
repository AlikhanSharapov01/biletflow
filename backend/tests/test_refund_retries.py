"""Out-of-order refund callbacks, retry races and inbox recovery (#65; BF-08, BF-13, AC-07/16/26).

A refund is one logical obligation retried as numbered attempts. Only the newest attempt may move
the refund to `failed` and schedule the next dispatch; a late failure for a replaced attempt is
acknowledged and audited without changing anything. An inbox row that cannot be applied is
quarantined so later notifications still apply.
"""

from concurrent.futures import ThreadPoolExecutor
from uuid import UUID

import pytest
from sqlalchemy import func, select, update
from sqlalchemy.exc import OperationalError
from test_finance import end_event, funded, payout, transition
from test_paid_orders import refund_event
from test_refunds import paid_order, refund, states

from app import payments_service
from app.catalog_models import Allocation
from app.checkout_models import TicketOrder
from app.commerce_models import PaymentIntent, ProviderEvent, Refund, RefundAttempt
from app.finance_models import FinanceEntry
from app.models import AuditLog, OutboxJob
from app.payments_service import (
    dispatch_refund_once,
    new_attempt,
    process,
    process_received_once,
    receive,
    refund_request_key,
    schedule_refund,
)
from app.security import now


def started(client, setup, account):
    f, order, headers, _ = paid_order(client, setup, account)
    r = refund(client, f, order)
    assert r.status_code == 200, r.text
    return f, order, headers, UUID(r.json()["refund"]["id"])


def dispatch(factory):
    """Run the next refund dispatch now, skipping the 30-second retry back-off."""
    with factory.begin() as db:
        db.execute(
            update(OutboxJob)
            .where(OutboxJob.kind == "refund_dispatch", OutboxJob.status == "pending")
            .values(available_at=now())
        )
    return dispatch_refund_once(factory)


def attempts(factory, refund_id):
    with factory() as db:
        rows = db.scalars(
            select(RefundAttempt)
            .where(RefundAttempt.refund_id == refund_id)
            .order_by(RefundAttempt.attempt_number)
        )
        return [(a.attempt_number, str(a.id), a.status) for a in rows]


def refund_status(factory, refund_id):
    with factory() as db:
        return db.get(Refund, refund_id).status


def dispatch_keys(factory, refund_id):
    with factory() as db:
        return sorted(
            db.scalars(
                select(OutboxJob.deduplication_key).where(
                    OutboxJob.kind == "refund_dispatch",
                    OutboxJob.payload["refund_id"].astext == str(refund_id),
                )
            )
        )


def audits(factory, action):
    with factory() as db:
        return list(
            db.scalars(
                select(AuditLog.safe_change)
                .where(AuditLog.action == action)
                .order_by(AuditLog.created_at)
            )
        )


def received_count(factory):
    with factory() as db:
        return db.scalar(
            select(func.count(ProviderEvent.id)).where(ProviderEvent.status == "received")
        )


def key(refund_id, number):
    return f"refund-dispatch:{refund_id}:{number}"


def first_failed_then_retried(client, factory, headers, refund_id):
    """Attempt 1 fails, the worker dispatches attempt 2; return both attempt ids."""
    assert dispatch(factory)
    [(_, first, _)] = attempts(factory, refund_id)
    out = refund_event(client, headers, first, "failed", external_event_id="evt-a1-fail")
    assert out["refund"]["status"] == "failed"
    assert dispatch(factory)
    second = attempts(factory, refund_id)[1][1]
    assert refund_status(factory, refund_id) == "pending"
    return first, second


def assert_released_once(factory, order_id, refund_id):
    assert states(factory, order_id) == ("refunded", ["refunded"], ["released"])
    with factory() as db:
        assert db.scalar(select(func.count(Refund.id))) == 1
        succeeded = db.scalar(
            select(func.count(AuditLog.id)).where(
                AuditLog.action == "payments.refund_succeeded", AuditLog.entity_id == refund_id
            )
        )
        assert succeeded == 1
        order = db.get(TicketOrder, UUID(order_id))
        released = list(
            db.scalars(select(Allocation.release_reason).where(Allocation.hold_id == order.hold_id))
        )
        assert released == ["refund_succeeded"]
        notices = db.scalar(
            select(func.count(OutboxJob.id)).where(
                OutboxJob.kind == "notification_fanout",
                OutboxJob.payload["notice"].astext == "refund_completed",
            )
        )
        assert notices == 1


def test_stale_failure_cannot_regress_a_newer_pending_attempt(
    client, setup, account, factory, settings
):
    f, order, headers, refund_id = started(client, setup, account)
    first, second = first_failed_then_retried(client, factory, headers, refund_id)

    # A distinct provider event reports attempt 1 failed again while attempt 2 is in flight.
    late = refund_event(client, headers, first, "failed", external_event_id="evt-a1-fail-late")
    assert late["refund"]["status"] == "pending"
    assert late["refund"]["latest_attempt_id"] == second
    assert late["refund"]["latest_attempt_status"] == "pending"
    assert attempts(factory, refund_id) == [(1, first, "failed"), (2, second, "pending")]
    # No second job for attempt 2, and no job for attempt 3.
    assert dispatch_keys(factory, refund_id) == [key(refund_id, 1), key(refund_id, 2)]
    assert dispatch(factory) is False
    with factory() as db:
        row = db.scalar(
            select(ProviderEvent).where(ProviderEvent.external_event_id == "evt-a1-fail-late")
        )
        assert row.status == "processed" and row.processed_at is not None
    assert audits(factory, "payments.refund_stale_result_ignored") == [
        {"outcome": "failed", "attempt_number": 1, "current_attempt_number": 2}
    ]
    assert len(audits(factory, "payments.refund_failed")) == 1
    assert received_count(factory) == 0
    assert process_received_once(factory, settings) is False

    # The newer attempt still completes normally, and the stock is released once.
    done = refund_event(client, headers, second, "succeeded", external_event_id="evt-a2-ok")
    assert done["refund"]["status"] == "succeeded"
    assert_released_once(factory, order["id"], refund_id)


def test_stale_failure_cannot_regress_a_newer_unknown_attempt(client, setup, account, factory):
    f, order, headers, refund_id = started(client, setup, account)
    first, second = first_failed_then_retried(client, factory, headers, refund_id)
    refund_event(client, headers, second, "unknown", external_event_id="evt-a2-unknown")
    late = refund_event(client, headers, first, "failed", external_event_id="evt-a1-fail-late")
    assert late["refund"]["status"] == "pending"
    assert attempts(factory, refund_id) == [(1, first, "failed"), (2, second, "unknown")]
    # A late "unknown" for the replaced attempt is ignored as well.
    refund_event(client, headers, first, "unknown", external_event_id="evt-a1-unknown-late")
    assert attempts(factory, refund_id)[0][2] == "failed"
    assert dispatch_keys(factory, refund_id) == [key(refund_id, 1), key(refund_id, 2)]
    assert len(audits(factory, "payments.refund_stale_result_ignored")) == 2

    # The authoritative answer for attempt 2 is still accepted.
    failed = refund_event(client, headers, second, "failed", external_event_id="evt-a2-fail")
    assert failed["refund"]["status"] == "failed"
    assert dispatch_keys(factory, refund_id) == [key(refund_id, n) for n in (1, 2, 3)]
    assert dispatch(factory)
    third = attempts(factory, refund_id)[2][1]
    refund_event(client, headers, third, "succeeded", external_event_id="evt-a3-ok")
    assert_released_once(factory, order["id"], refund_id)


def test_stale_failure_after_newer_success_changes_nothing(client, setup, account, factory):
    f, order, headers, refund_id = started(client, setup, account)
    first, second = first_failed_then_retried(client, factory, headers, refund_id)
    refund_event(client, headers, second, "succeeded", external_event_id="evt-a2-ok")
    assert_released_once(factory, order["id"], refund_id)

    for index, (attempt, outcome) in enumerate(
        [(first, "failed"), (second, "failed"), (second, "succeeded"), (first, "unknown")]
    ):
        late = refund_event(
            client, headers, attempt, outcome, external_event_id=f"evt-late-{index}"
        )
        assert late["refund"]["status"] == "succeeded"
    assert attempts(factory, refund_id) == [(1, first, "failed"), (2, second, "succeeded")]
    assert dispatch_keys(factory, refund_id) == [key(refund_id, 1), key(refund_id, 2)]
    assert dispatch(factory) is False
    assert received_count(factory) == 0
    assert_released_once(factory, order["id"], refund_id)


def test_duplicate_event_id_is_applied_once(client, setup, account, factory):
    f, order, headers, refund_id = started(client, setup, account)
    assert dispatch(factory)
    [(_, first, _)] = attempts(factory, refund_id)
    one = refund_event(client, headers, first, "failed", external_event_id="evt-dup")
    two = refund_event(client, headers, first, "failed", external_event_id="evt-dup")
    assert one["provider_event_id"] == two["provider_event_id"]
    assert dispatch_keys(factory, refund_id) == [key(refund_id, 1), key(refund_id, 2)]
    assert len(audits(factory, "payments.refund_failed")) == 1

    # After the retry starts, replaying the same event id is still a no-op.
    assert dispatch(factory)
    three = refund_event(client, headers, first, "failed", external_event_id="evt-dup")
    assert three["provider_event_id"] == one["provider_event_id"]
    assert three["refund"]["status"] == "pending"
    assert audits(factory, "payments.refund_stale_result_ignored") == []
    # The same id with a different body is a conflict, not a new event.
    conflict = client.post(
        f"/api/v1/simulator/refunds/{first}/events",
        headers=headers,
        json={"outcome": "succeeded", "external_event_id": "evt-dup"},
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["code"] == "provider_event_conflict"
    assert refund_status(factory, refund_id) == "pending"


def test_scheduling_the_same_attempt_twice_is_a_no_op(client, setup, account, factory):
    f, order, headers, refund_id = started(client, setup, account)
    with factory.begin() as db:
        row = db.get(Refund, refund_id)
        schedule_refund(db, row, 1)
        schedule_refund(db, row, 2)
        schedule_refund(db, row, 2)
    assert dispatch_keys(factory, refund_id) == [key(refund_id, 1), key(refund_id, 2)]


def test_racing_failures_and_dispatch_create_one_retry(client, setup, account, factory, settings):
    f, order, headers, refund_id = started(client, setup, account)
    assert dispatch(factory)
    [(_, first, _)] = attempts(factory, refund_id)

    # Two distinct failure notifications for the current attempt, applied by two workers.
    ids = [
        receive(factory, f"evt-race-{n}", {"outcome": "failed"}, refund_attempt_id=UUID(first))
        for n in range(2)
    ]
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda i: process(factory, settings, i), ids))
    assert results == ["processed", "processed"]
    assert refund_status(factory, refund_id) == "failed"
    assert dispatch_keys(factory, refund_id) == [key(refund_id, 1), key(refund_id, 2)]
    assert len(audits(factory, "payments.refund_failed")) == 1

    # Two workers race for the retry while a third late failure for attempt 1 arrives.
    late = receive(factory, "evt-race-late", {"outcome": "failed"}, refund_attempt_id=UUID(first))
    with factory.begin() as db:
        db.execute(
            update(OutboxJob)
            .where(OutboxJob.kind == "refund_dispatch", OutboxJob.status == "pending")
            .values(available_at=now())
        )
    with ThreadPoolExecutor(max_workers=3) as pool:
        jobs = [pool.submit(dispatch_refund_once, factory) for _ in range(2)]
        applied = pool.submit(process, factory, settings, late)
        assert sorted(job.result() for job in jobs) == [False, True]
        assert applied.result() == "processed"
    rows = attempts(factory, refund_id)
    assert [(n, status) for n, _, status in rows] == [(1, "failed"), (2, "pending")]
    # Whichever order the late failure and the dispatch took, the retry stays pending.
    assert refund_status(factory, refund_id) == "pending"
    assert dispatch_keys(factory, refund_id) == [key(refund_id, 1), key(refund_id, 2)]
    assert dispatch(factory) is False

    refund_event(client, headers, rows[1][1], "succeeded", external_event_id="evt-race-ok")
    assert_released_once(factory, order["id"], refund_id)


def test_poison_inbox_row_is_quarantined_and_later_events_apply(
    client, setup, account, factory, settings
):
    f, order, headers, refund_id = started(client, setup, account)
    assert dispatch(factory)
    [(_, first, _)] = attempts(factory, refund_id)
    # A malformed notification (no outcome) is older than a valid success.
    bad = receive(factory, "evt-poison", {"result": "?"}, refund_attempt_id=UUID(first))
    good = receive(
        factory, "evt-after-poison", {"outcome": "succeeded"}, refund_attempt_id=UUID(first)
    )

    assert process_received_once(factory, settings) is True
    with factory() as db:
        row = db.get(ProviderEvent, bad)
        assert (row.status, row.rejection_reason) == ("rejected", "apply_failed:KeyError")
        assert db.get(ProviderEvent, good).status == "received"
    assert refund_status(factory, refund_id) == "pending"
    assert audits(factory, "payments.provider_event_quarantined") == [
        {"reason": "apply_failed:KeyError"}
    ]

    assert process_received_once(factory, settings) is True
    assert process_received_once(factory, settings) is False
    with factory() as db:
        assert db.get(ProviderEvent, good).status == "processed"
        assert db.get(ProviderEvent, bad).status == "rejected"
    assert refund_status(factory, refund_id) == "succeeded"
    assert_released_once(factory, order["id"], refund_id)
    # Replaying the quarantined event id returns the same rejected row and applies nothing.
    replay = receive(factory, "evt-poison", {"result": "?"}, refund_attempt_id=UUID(first))
    assert replay == bad and process(factory, settings, bad) == "rejected"


def test_transient_database_error_leaves_the_row_for_retry(
    client, setup, account, factory, settings, monkeypatch
):
    f, order, headers, refund_id = started(client, setup, account)
    assert dispatch(factory)
    [(_, first, _)] = attempts(factory, refund_id)
    inbox = receive(
        factory, "evt-transient", {"outcome": "succeeded"}, refund_attempt_id=UUID(first)
    )
    real = payments_service.apply_refund_result

    def locked_out(db, event, row):
        raise OperationalError("SELECT ... FOR UPDATE", {}, Exception("lock timeout"))

    monkeypatch.setattr(payments_service, "apply_refund_result", locked_out)
    with pytest.raises(OperationalError):
        process_received_once(factory, settings)
    with factory() as db:
        assert db.get(ProviderEvent, inbox).status == "received"
    monkeypatch.setattr(payments_service, "apply_refund_result", real)
    assert process_received_once(factory, settings) is True
    assert refund_status(factory, refund_id) == "succeeded"
    assert_released_once(factory, order["id"], refund_id)


def test_refund_request_key_is_stable_per_attempt(client, setup, account, factory, monkeypatch):
    f, order, headers, refund_id = started(client, setup, account)
    real = payments_service.finish

    def crash(job):
        raise RuntimeError("worker died before commit")

    # The first dispatch dies inside its transaction; the retry reuses the same request key.
    monkeypatch.setattr(payments_service, "finish", crash)
    with pytest.raises(RuntimeError):
        dispatch(factory)
    assert attempts(factory, refund_id) == []
    monkeypatch.setattr(payments_service, "finish", real)
    assert dispatch(factory)
    [(_, first, _)] = attempts(factory, refund_id)
    refund_event(client, headers, first, "failed", external_event_id="evt-key-fail")
    assert dispatch(factory)
    with factory() as db:
        keys = list(
            db.scalars(
                select(RefundAttempt.provider_request_key)
                .where(RefundAttempt.refund_id == refund_id)
                .order_by(RefundAttempt.attempt_number)
            )
        )
    assert keys == [refund_request_key(refund_id, 1), refund_request_key(refund_id, 2)]
    assert keys[0] != keys[1]


def test_out_of_order_compensation_refund_has_one_finance_entry(client, setup, account, factory):
    # A compensation refund after a sent payout writes one finance adjustment, however many
    # late or duplicate callbacks arrive.
    f, _, _ = funded(client, setup, account)
    p = payout(client, f, 664000).json()
    end_event(factory, f)
    assert transition(client, f, p["id"], "eligible").status_code == 200
    assert transition(client, f, p["id"], "sent").status_code == 200
    with factory.begin() as db:
        intent = db.scalar(
            select(PaymentIntent).where(
                PaymentIntent.event_id == UUID(f["event"]["id"]),
                PaymentIntent.purpose == "activation",
            )
        )
        charge = new_attempt(db, intent).id
    client.post(
        f"/api/v1/simulator/payments/{charge}/events",
        headers=f["headers"],
        json={"outcome": "succeeded"},
    )
    with factory() as db:
        refund_id = db.scalar(select(Refund.id).where(Refund.payment_attempt_id == charge))
    staff = f["headers"]
    first, second = first_failed_then_retried(client, factory, staff, refund_id)
    refund_event(client, staff, first, "failed", external_event_id="evt-comp-late-1")
    refund_event(client, staff, second, "succeeded", external_event_id="evt-comp-ok")
    refund_event(client, staff, second, "succeeded", external_event_id="evt-comp-ok-again")
    refund_event(client, staff, first, "failed", external_event_id="evt-comp-late-2")
    assert refund_status(factory, refund_id) == "succeeded"
    with factory() as db:
        entries = list(
            db.scalars(select(FinanceEntry.kind).where(FinanceEntry.refund_id == refund_id))
        )
    assert entries == ["activation_refund"]
    assert dispatch_keys(factory, refund_id) == [key(refund_id, 1), key(refund_id, 2)]
