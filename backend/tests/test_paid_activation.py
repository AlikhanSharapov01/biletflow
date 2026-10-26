from uuid import UUID, uuid4

from sqlalchemy import func, select

from app.activation_service import TERMS_VERSION, reinstate, suspend
from app.commerce_models import PaymentAttempt, ProviderEvent, Refund, SalesActivation
from app.models import AuditLog
from app.payments_service import initialize_once, process_received_once, receive
from app.security import challenge_value

API = "/api/v1"


def paid_type(client, f):
    r = client.post(
        API + f"/events/{f['event']['id']}/ticket-types",
        headers=f["headers"],
        json=f["ticket_data"] | {"name": "Paid seat", "kind": "paid", "price_minor": 400000},
    )
    assert r.status_code == 201, r.text
    return r.json()


def checklist(client, f, headers=None):
    return client.get(
        API + f"/events/{f['event']['id']}/paid-sales", headers=headers or f["headers"]
    )


def activate(client, f, headers=None, key=None):
    extra = {"Idempotency-Key": key} if key else {}
    return client.post(
        API + f"/events/{f['event']['id']}/paid-sales/activation",
        headers=(headers or f["headers"]) | extra,
    )


def org_ready(client, f):
    for step in ("payout-profile", "identity-verification"):
        r = client.post(
            API + f"/organizations/{f['org']['id']}/paid-sales/{step}", headers=f["headers"]
        )
        assert r.status_code == 200, r.text
        assert r.json()["environment"] == "simulation"


def terms(client, f, version=TERMS_VERSION):
    return client.post(
        API + f"/events/{f['event']['id']}/paid-sales/terms",
        headers=f["headers"],
        json={"terms_version": version},
    )


def ready(client, f):
    paid = paid_type(client, f)
    org_ready(client, f)
    assert terms(client, f).status_code == 200
    return paid


def pay(client, headers, attempt_id, outcome, **extra):
    return client.post(
        API + f"/simulator/payments/{attempt_id}/events",
        headers=headers,
        json={"outcome": outcome, **extra},
    )


def hold_paid(client, f, headers, paid):
    return client.post(
        API + f"/events/{f['event']['id']}/holds",
        headers=headers,
        json={"items": [{"ticket_type_id": paid["id"], "quantity": 1}]},
    )


def published(client, setup):
    f = setup()
    assert (
        client.post(API + f"/events/{f['event']['id']}/publish", headers=f["headers"]).status_code
        == 200
    )
    return f


def test_every_prerequisite_is_required(client, setup, account):
    f = published(client, setup)
    start = checklist(client, f).json()
    assert start["status"] == "incomplete" and start["simulated"] is True
    assert set(start["missing"]) == {
        "paid_ticket_type",
        "payout_profile",
        "identity_verification",
        "terms",
        "activation_fee",
    }
    paid = paid_type(client, f)
    r = activate(client, f)
    assert r.status_code == 409 and r.json()["detail"] == {
        "code": "activation_incomplete",
        "missing": ["payout_profile", "identity_verification", "terms"],
    }
    org_ready(client, f)
    assert activate(client, f).json()["detail"]["missing"] == ["terms"]
    assert terms(client, f, "2020-old").json()["detail"]["code"] == "terms_version_outdated"
    assert terms(client, f).json()["terms"]["accepted"] is True

    started = activate(client, f)
    assert started.status_code == 200, started.text
    body = started.json()
    assert body["status"] == "pending" and body["missing"] == ["activation_fee"]
    assert body["payment"]["status"] == "created" and body["payment"]["simulated"] is True
    assert body["activation_fee_minor"] == 500000
    _, _, buyer = account()
    assert hold_paid(client, f, buyer, paid).json()["detail"]["code"] == "paid_sales_inactive"


def test_failed_retried_duplicate_and_late_payments(client, setup, factory):
    f = published(client, setup)
    ready(client, f)
    first = activate(client, f).json()["payment"]["id"]
    assert pay(client, f["headers"], first, "failed").json()["attempt"]["status"] == "failed"
    assert checklist(client, f).json()["status"] == "failed"

    second = activate(client, f).json()["payment"]["id"]
    assert second != first
    # While a charge is open, starting again never creates a second attempt.
    assert activate(client, f).json()["payment"]["id"] == second
    ok = pay(client, f["headers"], second, "succeeded", external_event_id="evt-ok")
    assert ok.status_code == 200 and ok.json()["attempt"]["charged_minor"] == 500000
    done = checklist(client, f).json()
    assert done["status"] == "active" and done["activated_at"] and done["missing"] == []

    replay = pay(client, f["headers"], second, "succeeded", external_event_id="evt-ok")
    assert replay.json()["provider_event_id"] == ok.json()["provider_event_id"]
    clash = pay(client, f["headers"], second, "failed", external_event_id="evt-ok")
    assert clash.status_code == 409 and clash.json()["detail"]["code"] == "provider_event_conflict"
    stale = pay(client, f["headers"], second, "failed")
    assert stale.json()["attempt"]["status"] == "succeeded"
    late = pay(client, f["headers"], first, "succeeded")
    assert late.json()["attempt"]["status"] == "succeeded"
    assert activate(client, f).json()["status"] == "active"
    with factory() as db:
        activation = db.scalar(select(SalesActivation))
        assert activation.paid_attempt_id == UUID(second)
        assert db.get(PaymentAttempt, UUID(first)).safe_result["retained"] == "not_fulfilled"
        late_refund = db.scalar(select(Refund).where(Refund.payment_attempt_id == UUID(first)))
        assert late_refund.reason == "duplicate_charge" and late_refund.amount_minor == 500000
        activated = select(func.count(AuditLog.id)).where(AuditLog.action == "paid_sales.activated")
        assert db.scalar(activated) == 1
        assert db.scalar(select(func.count(PaymentAttempt.id))) == 2


def test_wrong_amount_never_activates(client, setup):
    f = published(client, setup)
    ready(client, f)
    attempt = activate(client, f).json()["payment"]["id"]
    r = pay(client, f["headers"], attempt, "succeeded", amount_minor=100)
    assert r.json()["attempt"]["status"] == "succeeded"
    assert checklist(client, f).json()["status"] == "pending"


def test_activation_is_per_event_and_never_copied(client, setup, account):
    a = published(client, setup)
    paid_a = ready(client, a)
    attempt = activate(client, a).json()["payment"]["id"]
    pay(client, a["headers"], attempt, "succeeded")
    # A second event in the same organization shares its payout and identity records.
    event_b = client.post(
        API + f"/organizations/{a['org']['id']}/events", headers=a["headers"], json=a["data"]
    )
    assert event_b.status_code == 201, event_b.text
    b = a | {"event": event_b.json()}
    paid_b = paid_type(client, b)
    assert (
        client.post(API + f"/events/{b['event']['id']}/publish", headers=b["headers"]).status_code
        == 200
    )
    status_b = checklist(client, b).json()
    assert status_b["status"] == "incomplete"
    assert set(status_b["missing"]) == {"terms", "activation_fee"}

    _, _, buyer = account()
    # Only the activated event accepts holds for its paid ticket type.
    assert hold_paid(client, a, buyer, paid_a).status_code == 201
    assert hold_paid(client, b, buyer, paid_b).json()["detail"]["code"] == "paid_sales_inactive"

    copy = client.post(API + f"/events/{a['event']['id']}/duplicate", headers=a["headers"])
    assert copy.status_code == 201, copy.text
    copied = client.get(API + f"/events/{copy.json()['id']}/paid-sales", headers=a["headers"])
    assert copied.json()["status"] == "incomplete" and copied.json()["payment"] is None


def test_only_finance_actors_and_the_payer(client, setup, account, settings, app):
    f = published(client, setup)
    ready(client, f)
    attempt = activate(client, f).json()["payment"]["id"]
    _, _, stranger = account()
    assert checklist(client, f, stranger).status_code == 404
    assert activate(client, f, stranger).status_code == 404
    other = setup()
    r = client.post(
        API + f"/organizations/{f['org']['id']}/paid-sales/payout-profile", headers=other["headers"]
    )
    assert r.status_code == 404

    email, _, member = account()
    invitation = client.post(
        API + f"/organizations/{f['org']['id']}/invitations",
        headers=f["headers"],
        json={"email": email},
    ).json()
    token = challenge_value(settings, "staff_invite", invitation["id"])
    assert (
        client.post(
            API + "/staff-invitations/accept", headers=member, json={"token": token}
        ).status_code
        == 200
    )
    r = checklist(client, f, member)
    assert r.status_code == 403 and r.json()["detail"]["code"] == "permission_denied"

    assert pay(client, stranger, attempt, "succeeded").status_code == 404
    app.state.settings.environment = "production"
    assert pay(client, f["headers"], attempt, "succeeded").status_code == 404
    app.state.settings.environment = "test"
    assert checklist(client, f).json()["status"] == "pending"


def test_suspension_blocks_paid_sales_until_reinstated(client, setup, account, factory):
    f = published(client, setup)
    paid = ready(client, f)
    pay(client, f["headers"], activate(client, f).json()["payment"]["id"], "succeeded")
    with factory.begin() as db:
        suspend(db, UUID(f["event"]["id"]), "Chargeback investigation")
    view = checklist(client, f).json()
    assert view["status"] == "suspended" and view["suspension_reason"] == "Chargeback investigation"
    assert activate(client, f).json()["detail"]["code"] == "paid_sales_suspended"
    _, _, buyer = account()
    assert hold_paid(client, f, buyer, paid).json()["detail"]["code"] == "paid_sales_inactive"
    with factory.begin() as db:
        reinstate(db, UUID(f["event"]["id"]))
    assert checklist(client, f).json()["status"] == "active"


def test_retries_initialization_and_interrupted_processing(client, setup, factory, settings):
    f = published(client, setup)
    ready(client, f)
    key = str(uuid4())
    first = activate(client, f, key=key).json()["payment"]["id"]
    assert activate(client, f, key=key).json()["payment"]["id"] == first
    assert initialize_once(factory) is True
    assert initialize_once(factory) is False
    with factory() as db:
        attempt = db.get(PaymentAttempt, UUID(first))
        assert attempt.status == "pending" and attempt.provider_payment_id.startswith("sim_")

    # A notification stored before the process stopped is applied by the worker later.
    receive(
        factory,
        "evt-recovered",
        {"outcome": "succeeded", "amount_minor": 500000, "currency": "KZT"},
        payment_attempt_id=UUID(first),
    )
    assert checklist(client, f).json()["status"] == "pending"
    assert process_received_once(factory, settings) is True
    assert process_received_once(factory, settings) is False
    assert checklist(client, f).json()["status"] == "active"
    with factory() as db:
        assert db.scalar(select(ProviderEvent.status)) == "processed"
