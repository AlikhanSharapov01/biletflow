from datetime import timedelta
from uuid import UUID

from sqlalchemy import func, select, update
from test_admission import staff
from test_campaigns import create as create_campaign
from test_paid_orders import PRICE, buyer_order, hold, paid_event, pay, refund_event

from app.campaign_models import PromoRedemption
from app.catalog_models import Allocation, Event
from app.checkout_models import Ticket, TicketOrder
from app.commerce_models import Refund, RefundAttempt
from app.models import AuditLog
from app.payments_service import dispatch_refund_once
from app.security import now
from app.support_models import SupportCase

API = "/api/v1"


def paid_order(client, setup, account, limit=12, quantity=1):
    f = paid_event(client, setup, limit=limit)
    order, headers, held = buyer_order(client, account, f, quantity=quantity)
    pay(client, headers, order["payment"]["id"], "succeeded")
    return f, order, headers, held


def refund(client, f, order, headers=None, reason="Customer asked"):
    return client.post(
        API + f"/orders/{order['id']}/refunds",
        headers=headers or f["headers"],
        json={"reason": reason},
    )


def free_order(client, setup, account, quantity=1):
    f = setup()
    client.post(API + f"/events/{f['event']['id']}/publish", headers=f["headers"])
    email, _, headers = account()
    held = hold(client, f, headers, f["ticket"]["id"], quantity)
    body = {
        "recipients": [
            {"allocation_id": row["id"], "name": f"Guest {i}", "email": email}
            for i, row in enumerate(held["allocations"])
        ]
    }
    order = client.post(API + f"/holds/{held['id']}/confirm", headers=headers, json=body)
    assert order.status_code == 200, order.text
    return f, order.json(), headers


def states(factory, order_id):
    with factory() as db:
        order = db.get(TicketOrder, UUID(order_id))
        tickets = list(db.scalars(select(Ticket.status).where(Ticket.event_id == order.event_id)))
        allocations = list(
            db.scalars(select(Allocation.state).where(Allocation.hold_id == order.hold_id))
        )
        return order.status, sorted(tickets), sorted(allocations)


def settle(client, factory, order_id, headers, outcome="succeeded", **extra):
    assert dispatch_refund_once(factory)
    with factory() as db:
        attempt = db.scalar(select(RefundAttempt).order_by(RefundAttempt.attempt_number.desc()))
        attempt_id = str(attempt.id)
    return refund_event(client, headers, attempt_id, outcome, **extra)


def test_full_refund_quarantines_then_releases_stock(client, setup, account, factory):
    f, order, headers, _ = paid_order(client, setup, account, limit=2, quantity=2)
    started = refund(client, f, order)
    assert started.status_code == 200, started.text
    data = started.json()
    assert data["status"] == "refund_pending" and data["refund"]["status"] == "requested"
    assert data["refund"]["amount_minor"] == 2 * PRICE and data["refund"]["reason"] == "voluntary"
    assert states(factory, order["id"]) == (
        "refund_pending",
        ["refund_pending", "refund_pending"],
        ["refund_quarantine", "refund_quarantine"],
    )
    # Quarantined stock cannot be bought again while the money is still owed.
    _, _, rival = account()
    blocked = client.post(
        API + f"/events/{f['event']['id']}/holds",
        headers=rival,
        json={"items": [{"ticket_type_id": f["paid"]["id"], "quantity": 1}]},
    )
    assert blocked.status_code == 409

    settle(client, factory, order["id"], headers)
    assert states(factory, order["id"]) == (
        "refunded",
        ["refunded", "refunded"],
        ["released", "released"],
    )
    again = hold(client, f, rival, f["paid"]["id"], 1)
    assert again["status"] == "active"


def test_refund_uses_the_amount_actually_paid(client, setup, account, factory):
    f = paid_event(client, setup)
    create_campaign(client, f, code="OFF10", max_redemptions=1)
    email, _, headers = account()
    held = client.post(
        API + f"/events/{f['event']['id']}/holds",
        headers=headers,
        json={
            "items": [{"ticket_type_id": f["paid"]["id"], "quantity": 1}],
            "promo_code": "OFF10",
        },
    ).json()
    order = client.post(
        API + f"/holds/{held['id']}/checkout",
        headers=headers,
        json={
            "recipients": [
                {"allocation_id": held["allocations"][0]["id"], "name": "A", "email": email}
            ]
        },
    ).json()
    pay(client, headers, order["payment"]["id"], "succeeded")
    started = refund(client, f, order).json()
    assert started["refund"]["amount_minor"] == PRICE - PRICE // 10
    settle(client, factory, order["id"], headers)
    # A refund never gives the redemption back.
    with factory() as db:
        assert db.scalar(select(func.count(PromoRedemption.id))) == 1
    _, _, other = account()
    again = client.post(
        API + f"/events/{f['event']['id']}/holds",
        headers=other,
        json={
            "items": [{"ticket_type_id": f["paid"]["id"], "quantity": 1}],
            "promo_code": "OFF10",
        },
    )
    assert again.status_code == 409 and again.json()["detail"]["code"] == "promo_exhausted"


def test_double_submit_and_replayed_callback_change_nothing(client, setup, account, factory):
    f, order, headers, _ = paid_order(client, setup, account)
    first = refund(client, f, order).json()
    second = refund(client, f, order).json()
    assert first["refund"]["id"] == second["refund"]["id"]
    with factory() as db:
        assert db.scalar(select(func.count(Refund.id))) == 1
    settle(client, factory, order["id"], headers, external_event_id="refund-evt-1")
    with factory() as db:
        attempt_id = str(db.scalar(select(RefundAttempt)).id)
        version = db.scalar(select(Event.availability_version))
    refund_event(client, headers, attempt_id, "succeeded", external_event_id="refund-evt-1")
    refund_event(client, headers, attempt_id, "succeeded")
    with factory() as db:
        assert db.scalar(select(Event.availability_version)) == version
    third = refund(client, f, order)
    assert third.status_code == 200 and third.json()["status"] == "refunded"


def test_failed_refund_stays_blocked_until_it_succeeds(client, setup, account, factory):
    f, order, headers, _ = paid_order(client, setup, account)
    refund(client, f, order)
    settle(client, factory, order["id"], headers, "failed")
    assert states(factory, order["id"]) == (
        "refund_pending",
        ["refund_pending"],
        ["refund_quarantine"],
    )
    with factory.begin() as db:
        from app.models import OutboxJob

        db.execute(
            update(OutboxJob)
            .where(OutboxJob.kind == "refund_dispatch", OutboxJob.status == "pending")
            .values(available_at=now())
        )
    settle(client, factory, order["id"], headers, "succeeded")
    assert states(factory, order["id"]) == ("refunded", ["refunded"], ["released"])


def test_refunded_ticket_is_rejected_by_the_scanner(
    client, setup, account, factory, settings, no_entry_confirmation
):
    f, order, headers, _ = paid_order(client, setup, account)
    with factory.begin() as db:
        db.execute(
            update(Event)
            .where(Event.id == UUID(f["event"]["id"]))
            .values(
                admission_opens_at=now() - timedelta(hours=1),
                admission_closes_at=now() + timedelta(hours=1),
            )
        )
    view = client.get(API + f"/orders/{order['id']}", headers=headers).json()
    qr = view["items"][0]["ticket"]["qr_payload"]
    scanner = staff(client, settings, account, f, ["scan"])
    refund(client, f, order)
    pending = client.post(
        API + f"/scanner/events/{f['event']['id']}/check-ins",
        headers=scanner,
        json={"qr_payload": qr},
    )
    assert pending.status_code == 409 and pending.json()["detail"]["code"] == "ticket_not_valid"
    assert pending.json()["detail"]["status"] == "refund_pending"
    settle(client, factory, order["id"], headers)
    done = client.post(
        API + f"/scanner/events/{f['event']['id']}/check-ins",
        headers=scanner,
        json={"qr_payload": qr},
    )
    assert done.status_code == 409 and done.json()["detail"]["status"] == "refunded"


def test_refund_permission_scope(client, setup, account, settings):
    f, order, headers, _ = paid_order(client, setup, account)
    assert refund(client, f, order, headers=headers).status_code == 404
    _, _, stranger = account()
    assert refund(client, f, order, headers=stranger).status_code == 404
    scanner = staff(client, settings, account, f, ["scan"])
    denied = refund(client, f, order, headers=scanner)
    assert denied.status_code == 403 and denied.json()["detail"]["code"] == "permission_denied"
    finance = staff(client, settings, account, f, ["refund"])
    assert refund(client, f, order, headers=finance).status_code == 200


def test_refund_guards(client, setup, account, factory):
    g, free, _ = free_order(client, setup, account)
    r = refund(client, g, free)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "free_order_use_cancel"

    f, order, _, _ = paid_order(client, setup, account)
    with factory.begin() as db:
        db.execute(
            update(Ticket)
            .where(Ticket.event_id == UUID(f["event"]["id"]))
            .values(status="checked_in")
        )
    r = refund(client, f, order)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "ticket_checked_in"

    h, pending, _, _ = paid_event(client, setup), None, None, None
    pending, _, _ = buyer_order(client, account, h)
    r = refund(client, h, pending)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "order_not_refundable"


def test_refund_follows_the_saved_order_policy(client, setup, account, factory):
    f, order, _, _ = paid_order(client, setup, account)
    with factory.begin() as db:
        stored = db.get(TicketOrder, UUID(order["id"]))
        stored.policy_snapshot = {**stored.policy_snapshot, "refund_allowed": False}
    r = refund(client, f, order)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "refund_not_allowed"
    with factory.begin() as db:
        stored = db.get(TicketOrder, UUID(order["id"]))
        past = (now() - timedelta(days=1)).isoformat()
        stored.policy_snapshot = {
            **stored.policy_snapshot,
            "refund_allowed": True,
            "refund_cutoff_at": past,
        }
    r = refund(client, f, order)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "refund_cutoff_passed"


def test_organizer_cancels_one_free_ticket(client, setup, account, factory):
    f, order, _ = free_order(client, setup, account, quantity=2)
    tickets = [item["ticket"]["id"] for item in order["items"]]
    url = API + f"/events/{f['event']['id']}/tickets/%s/cancel"
    first = client.post(url % tickets[0], headers=f["headers"], json={"reason": "Duplicate"})
    assert first.status_code == 200, first.text
    assert first.json()["status"] == "cancelled"
    assert states(factory, order["id"]) == (
        "confirmed",
        ["cancelled", "valid"],
        ["released", "sold"],
    )
    repeat = client.post(url % tickets[0], headers=f["headers"], json={"reason": "Duplicate"})
    assert repeat.status_code == 200
    client.post(url % tickets[1], headers=f["headers"], json={"reason": "Duplicate"})
    assert states(factory, order["id"]) == (
        "cancelled",
        ["cancelled", "cancelled"],
        ["released", "released"],
    )
    history = client.get(API + f"/events/{f['event']['id']}/history", headers=f["headers"]).json()
    assert [row["description"] for row in history if row["action"] == "ticket.cancelled"] == [
        "Duplicate",
        "Duplicate",
    ]
    with factory() as db:
        assert (
            db.scalar(select(func.count(AuditLog.id)).where(AuditLog.action == "ticket.cancelled"))
            == 2
        )


def test_ticket_cancel_guards_and_scope(client, setup, account, settings, factory):
    f, order, headers, _ = paid_order(client, setup, account)
    ticket = client.get(API + f"/orders/{order['id']}", headers=headers).json()["items"][0][
        "ticket"
    ]
    url = API + f"/events/{f['event']['id']}/tickets/{ticket['id']}/cancel"
    r = client.post(url, headers=f["headers"], json={"reason": "x"})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "full_order_refund_required"
    assert client.post(url, headers=headers, json={"reason": "x"}).status_code == 404
    scanner = staff(client, settings, account, f, ["scan"])
    assert client.post(url, headers=scanner, json={"reason": "x"}).status_code == 403

    g, free, _ = free_order(client, setup, account)
    ticket_id = free["items"][0]["ticket"]["id"]
    with factory.begin() as db:
        db.execute(update(Ticket).where(Ticket.id == UUID(ticket_id)).values(status="checked_in"))
    r = client.post(
        API + f"/events/{g['event']['id']}/tickets/{ticket_id}/cancel",
        headers=g["headers"],
        json={"reason": "x"},
    )
    assert r.status_code == 409 and r.json()["detail"]["code"] == "ticket_checked_in"
    missing = client.post(
        API + f"/events/{g['event']['id']}/tickets/{ticket['id']}/cancel",
        headers=g["headers"],
        json={},
    )
    assert missing.status_code == 404


def test_attendee_cancels_a_free_registration(client, setup, account, factory):
    _, order, headers = free_order(client, setup, account, quantity=2)
    url = API + f"/orders/{order['id']}/cancel"
    _, _, stranger = account()
    assert client.post(url, headers=stranger, json={"reason": ""}).status_code == 404
    done = client.post(url, headers=headers, json={"reason": "Cannot come"})
    assert done.status_code == 200, done.text
    assert done.json()["status"] == "cancelled"
    assert states(factory, order["id"])[0] == "cancelled"
    assert client.post(url, headers=headers, json={"reason": ""}).status_code == 200


def test_attendee_cannot_cancel_a_paid_order(client, setup, account):
    _, order, headers, _ = paid_order(client, setup, account)
    r = client.post(API + f"/orders/{order['id']}/cancel", headers=headers, json={"reason": ""})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "full_order_refund_required"


def test_refund_request_opens_one_support_case(client, setup, account, factory):
    f, order, headers, _ = paid_order(client, setup, account)
    url = API + f"/orders/{order['id']}/refund-requests"
    first = client.post(url, headers=headers, json={"reason": "Plans changed"})
    assert first.status_code == 202, first.text
    assert first.json()["status"] == "requested"
    second = client.post(url, headers=headers, json={"reason": ""})
    assert second.json()["case_id"] == first.json()["case_id"]
    with factory() as db:
        case = db.scalar(select(SupportCase))
        assert case.category == "refund" and str(case.order_id) == order["id"]
    # A request changes nothing until authorized staff act on it.
    assert (
        client.get(API + f"/orders/{order['id']}", headers=headers).json()["status"] == "confirmed"
    )
    _, _, stranger = account()
    assert client.post(url, headers=stranger, json={"reason": ""}).status_code == 404
    queue = client.get(API + "/support/cases?view=queue", headers=f["headers"]).json()
    assert queue["total"] == 1


def test_refund_request_blank_reason_and_free_order(client, setup, account):
    _, order, headers, _ = paid_order(client, setup, account)
    url = API + f"/orders/{order['id']}/refund-requests"
    assert client.post(url, headers=headers, json={"reason": ""}).status_code == 202
    _, free, free_headers = free_order(client, setup, account)
    r = client.post(
        API + f"/orders/{free['id']}/refund-requests", headers=free_headers, json={"reason": ""}
    )
    assert r.status_code == 409 and r.json()["detail"]["code"] == "free_order_use_cancel"


def test_event_cancellation_with_sales_refunds_and_invalidates(client, setup, account, factory):
    f, order, headers, _ = paid_order(client, setup, account)
    email, _, other = account()
    held = hold(client, f, other, f["ticket"]["id"], 1)
    free = client.post(
        API + f"/holds/{held['id']}/confirm",
        headers=other,
        json={
            "recipients": [
                {"allocation_id": held["allocations"][0]["id"], "name": "B", "email": email}
            ]
        },
    ).json()
    _, _, waiting = account()
    active = hold(client, f, waiting, f["paid"]["id"], 1)

    cancelled = client.post(API + f"/events/{f['event']['id']}/cancel", headers=f["headers"])
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["publication_state"] == "cancelled"
    assert (
        client.post(API + f"/events/{f['event']['id']}/cancel", headers=f["headers"]).status_code
        == 200
    )
    with factory() as db:
        paid_row = db.get(TicketOrder, UUID(order["id"]))
        assert paid_row.status == "refund_pending"
        assert db.get(TicketOrder, UUID(free["id"])).status == "cancelled"
        assert db.scalar(select(func.count(Refund.id))) == 1
        assert db.scalar(select(Refund)).reason == "event_cancelled"
        statuses = sorted(db.scalars(select(Ticket.status)))
        assert statuses == ["cancelled", "refund_pending"]
        held_states = list(
            db.scalars(select(Allocation.state).where(Allocation.hold_id == UUID(active["id"])))
        )
        assert held_states == ["released"]
    settle(client, factory, order["id"], headers)
    assert states(factory, order["id"])[0] == "refunded"
    # Completion never reopens a cancelled event for sale.
    _, _, late = account()
    blocked = client.post(
        API + f"/events/{f['event']['id']}/holds",
        headers=late,
        json={"items": [{"ticket_type_id": f["paid"]["id"], "quantity": 1}]},
    )
    assert blocked.status_code == 404


def test_event_cancellation_with_paid_orders_needs_refund_permission(
    client, setup, account, settings
):
    f, _, _, _ = paid_order(client, setup, account)
    editor = staff(client, settings, account, f, ["event_edit"])
    denied = client.post(API + f"/events/{f['event']['id']}/cancel", headers=editor)
    assert denied.status_code == 403 and denied.json()["detail"]["code"] == "permission_denied"
