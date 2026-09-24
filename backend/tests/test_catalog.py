from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError

from app.catalog_models import Allocation, EventStaff, Hold, Invitation, Member, TicketType
from app.models import AuditLog
from app.security import challenge_value, now
from app.seed import seed_catalog, seed_id
from app.worker import deliver_once

API = "/api/v1"


@pytest.fixture
def setup(client, account, factory):
    seed_catalog(factory)

    def create(visibility="public", assigned=False, headers=None):
        headers = headers or account()[2]
        org = client.post(
            API + "/organizations",
            headers=headers,
            json={"name": "Demo Organizer", "contact_email": "organizer@example.com"},
        )
        assert org.status_code == 201, org.text
        data = {
            "category_id": str(seed_id("category-community")),
            "venue_id": str(seed_id("venue-campus")),
            "title": "Campus Concert",
            "description": "Demo event",
            "capacity": 12,
            "visibility": visibility,
            "starts_at": (now() + timedelta(days=10)).isoformat(),
            "ends_at": (now() + timedelta(days=10, hours=2)).isoformat(),
            "registration_opens_at": (now() - timedelta(days=1)).isoformat(),
            "registration_closes_at": (now() + timedelta(days=9)).isoformat(),
            "admission_opens_at": (now() + timedelta(days=10, minutes=-30)).isoformat(),
            "admission_closes_at": (now() + timedelta(days=10, hours=1)).isoformat(),
            "refund_cutoff_at": (now() + timedelta(days=8)).isoformat(),
        }
        if assigned:
            data.update(seating_mode="assigned", venue_layout_id=str(seed_id("layout-campus")))
        event = client.post(
            API + f"/organizations/{org.json()['id']}/events", headers=headers, json=data
        )
        assert event.status_code == 201, event.text
        ticket_data = {
            "name": "General admission",
            "kind": "free",
            "price_minor": 0,
            "quantity_limit": 12,
            "per_order_limit": 5,
            "sales_open_at": data["registration_opens_at"],
            "sales_close_at": data["registration_closes_at"],
        }
        ticket = client.post(
            API + f"/events/{event.json()['id']}/ticket-types", headers=headers, json=ticket_data
        )
        assert ticket.status_code == 201, ticket.text
        return {
            "headers": headers,
            "org": org.json(),
            "event": event.json(),
            "data": data,
            "ticket": ticket.json(),
            "ticket_data": ticket_data,
        }

    return create


def invite_member(client, factory, settings, setup, account, email=None):
    email, _, headers = account(email)
    r = client.post(
        API + f"/organizations/{setup['org']['id']}/invitations",
        headers=setup["headers"],
        json={"email": email},
    )
    assert r.status_code == 201, r.text
    token = challenge_value(settings, "staff_invite", r.json()["id"])
    r = client.post(API + "/staff-invitations/accept", headers=headers, json={"token": token})
    assert r.status_code == 200, r.text
    return r.json(), headers


def test_create_publish_browse_unpublish(client, setup):
    f = setup()
    eid, headers = f["event"]["id"], f["headers"]
    assert client.get(API + f"/events/{eid}").status_code == 404
    assert client.get(API + "/events").json() == []
    r = client.post(API + f"/events/{eid}/publish", headers=headers)
    assert r.status_code == 200 and r.json()["time_status"] == "upcoming"
    assert client.get(API + f"/events/{eid}").status_code == 200
    assert (
        len(
            client.get(
                API + "/events", params={"city": "almaty", "free": True, "q": "concert"}
            ).json()
        )
        == 1
    )
    assert client.get(API + "/events", params={"free": False}).json() == []
    assert client.get(API + "/events", params={"q": "%"}).json() == []
    assert client.get(API + "/events", params={"min_price": 10, "max_price": 0}).status_code == 422
    assert (
        client.post(API + f"/events/{eid}/publish", headers=headers).json()["availability_version"]
        == r.json()["availability_version"]
    )
    assert client.post(API + f"/events/{eid}/unpublish", headers=headers).status_code == 200
    assert client.get(API + "/events").json() == []
    assert client.get(API + f"/events/{eid}/ticket-types").status_code == 404


@pytest.mark.parametrize("visibility", ["private", "unlisted"])
def test_nonpublic_visibility_and_revocable_grant(client, setup, account, visibility):
    f = setup(visibility=visibility)
    eid = f["event"]["id"]
    client.post(API + f"/events/{eid}/publish", headers=f["headers"])
    assert client.get(API + "/events").json() == []
    assert client.get(API + f"/events/{eid}").status_code == (
        404 if visibility == "private" else 200
    )
    _, _, headers = account()
    if visibility == "private":
        uid = client.get(API + "/me", headers=headers).json()["id"]
        assert client.get(API + f"/events/{eid}", headers=headers).status_code == 404
        assert (
            client.put(
                API + f"/events/{eid}/access", headers=f["headers"], json={"user_id": uid}
            ).status_code
            == 200
        )
        assert client.get(API + f"/events/{eid}", headers=headers).status_code == 200
        assert client.get(API + f"/events/{eid}/ticket-types", headers=headers).status_code == 200
        client.delete(API + f"/events/{eid}/access/{uid}", headers=f["headers"])
        assert client.get(API + f"/events/{eid}/seats", headers=headers).status_code == 404


def test_cross_organization_denied_and_owner_preserved(client, setup):
    a, b = setup(), setup()
    oid, eid = a["org"]["id"], a["event"]["id"]
    assert client.get(API + f"/organizations/{oid}", headers=b["headers"]).status_code == 404
    assert (
        client.put(API + f"/events/{eid}", headers=b["headers"], json=a["data"]).status_code == 404
    )
    assert client.post(API + f"/events/{eid}/publish", headers=b["headers"]).status_code == 404
    member = client.get(API + f"/organizations/{oid}/members", headers=a["headers"]).json()[0]
    assert (
        client.delete(
            API + f"/organizations/{oid}/members/{member['id']}", headers=a["headers"]
        ).status_code
        == 409
    )
    assert (
        client.put(
            API + f"/organizations/{oid}/members/{member['id']}/permissions",
            headers=a["headers"],
            json={"capabilities": []},
        ).status_code
        == 409
    )
    assert (
        client.post(
            API + "/organizations", json={"name": "Unauthorized", "contact_email": "x@example.com"}
        ).status_code
        == 401
    )


def test_scanner_permissions_revocation_and_no_escalation(
    client, setup, account, factory, settings
):
    f = setup()
    member, scanner = invite_member(client, factory, settings, f, account)
    eid, oid = f["event"]["id"], f["org"]["id"]
    r = client.put(
        API + f"/events/{eid}/staff",
        headers=f["headers"],
        json={"member_id": member["id"], "capabilities": ["scan"]},
    )
    assert r.status_code == 200, r.text
    assert client.get(API + f"/events/{eid}", headers=scanner).status_code == 200
    assert len(client.get(API + f"/organizations/{oid}/events", headers=scanner).json()) == 1
    assert client.put(API + f"/events/{eid}", headers=scanner, json=f["data"]).status_code == 403
    assert client.get(API + f"/events/{eid}/history", headers=scanner).status_code == 403
    assert (
        client.put(
            API + f"/organizations/{oid}/members/{member['id']}/permissions",
            headers=scanner,
            json={"capabilities": ["finance"]},
        ).status_code
        == 403
    )
    assert (
        client.delete(
            API + f"/events/{eid}/staff/{r.json()['id']}", headers=f["headers"]
        ).status_code
        == 200
    )
    assert client.get(API + f"/events/{eid}", headers=scanner).status_code == 404
    assert client.get(API + f"/organizations/{oid}/events", headers=scanner).json() == []


def test_member_reinvite_does_not_restore_permissions(client, setup, account, factory, settings):
    f = setup()
    email = "reinvite@example.com"
    member, headers = invite_member(client, factory, settings, f, account, email)
    oid, eid = f["org"]["id"], f["event"]["id"]
    client.put(
        API + f"/organizations/{oid}/members/{member['id']}/permissions",
        headers=f["headers"],
        json={"capabilities": ["manage_profile"]},
    )
    client.put(
        API + f"/events/{eid}/staff",
        headers=f["headers"],
        json={"member_id": member["id"], "capabilities": ["event_edit"]},
    )
    assert (
        client.delete(
            API + f"/organizations/{oid}/members/{member['id']}", headers=f["headers"]
        ).status_code
        == 200
    )
    assert client.get(API + f"/organizations/{oid}", headers=headers).status_code == 404
    invitation = client.post(
        API + f"/organizations/{oid}/invitations", headers=f["headers"], json={"email": email}
    ).json()
    token = challenge_value(settings, "staff_invite", invitation["id"])
    assert (
        client.post(
            API + "/staff-invitations/accept", headers=headers, json={"token": token}
        ).status_code
        == 200
    )
    assert (
        client.patch(
            API + f"/organizations/{oid}", headers=headers, json={"name": "Hijack"}
        ).status_code
        == 403
    )
    assert client.get(API + f"/events/{eid}", headers=headers).status_code == 404


def test_invitation_wrong_user_replay_expiry_and_email_delivery(
    client, setup, account, factory, settings
):
    f = setup()
    email, _, intended = account()
    wrong = account()[2]
    path = API + f"/organizations/{f['org']['id']}/invitations"
    invitation = client.post(path, headers=f["headers"], json={"email": email}).json()
    assert "token_hash" not in invitation
    value = challenge_value(settings, "staff_invite", invitation["id"])
    messages = []
    while deliver_once(factory, settings, messages.append):
        pass
    invite = next(m for m in messages if m["Subject"] == "BiletFlow organizer invitation")
    assert value in invite.get_content() and invite["To"] == email
    assert (
        client.post(
            API + "/staff-invitations/accept", headers=wrong, json={"token": value}
        ).status_code
        == 400
    )
    assert (
        client.post(
            API + "/staff-invitations/accept", headers=intended, json={"token": value}
        ).status_code
        == 200
    )
    assert (
        client.post(
            API + "/staff-invitations/accept", headers=intended, json={"token": value}
        ).status_code
        == 400
    )
    newer = client.post(path, headers=f["headers"], json={"email": email}).json()
    with factory.begin() as db:
        db.execute(
            update(Invitation)
            .where(Invitation.id == UUID(newer["id"]))
            .values(created_at=now() - timedelta(days=2), expires_at=now() - timedelta(days=1))
        )
    assert (
        client.post(
            API + "/staff-invitations/accept",
            headers=intended,
            json={"token": challenge_value(settings, "staff_invite", newer["id"])},
        ).status_code
        == 400
    )


def test_replaced_and_revoked_invitation(client, setup, account, settings):
    f = setup()
    email, _, invited = account()
    path = API + f"/organizations/{f['org']['id']}/invitations"
    a = client.post(path, headers=f["headers"], json={"email": email}).json()
    b = client.post(path, headers=f["headers"], json={"email": email}).json()
    assert (
        client.post(
            API + "/staff-invitations/accept",
            headers=invited,
            json={"token": challenge_value(settings, "staff_invite", a["id"])},
        ).status_code
        == 400
    )
    assert client.delete(path + "/" + b["id"], headers=f["headers"]).status_code == 200
    assert (
        client.post(
            API + "/staff-invitations/accept",
            headers=invited,
            json={"token": challenge_value(settings, "staff_invite", b["id"])},
        ).status_code
        == 400
    )


def test_event_configuration_validation(client, setup):
    f = setup()
    for changes in [
        {"time_zone": "Invalid/Zone"},
        {"capacity": -1},
        {"ends_at": f["data"]["starts_at"]},
        {"seating_mode": "assigned"},
        {"starts_at": "2030-01-01T10:00:00"},
        {"publication_state": "published"},
    ]:
        r = client.put(
            API + f"/events/{f['event']['id']}", headers=f["headers"], json=f["data"] | changes
        )
        assert r.status_code == 422, (changes, r.text)
    assert (
        client.put(
            API + f"/events/{f['event']['id']}",
            headers=f["headers"],
            json=f["data"] | {"venue_id": str(uuid4())},
        ).status_code
        == 422
    )


def test_publish_requires_tickets_and_usable_configuration(client, setup, factory):
    f = setup()
    with factory.begin() as db:
        db.execute(update(TicketType).values(is_hidden=True))
    assert (
        client.post(API + f"/events/{f['event']['id']}/publish", headers=f["headers"]).status_code
        == 409
    )
    assert client.get(API + "/events").json() == []


def test_ticket_price_dates_and_hidden_visibility(client, setup):
    f = setup()
    base = API + f"/events/{f['event']['id']}/ticket-types"
    for changes in [{"price_minor": 1}, {"kind": "paid"}, {"quantity_limit": -1}]:
        assert (
            client.post(base, headers=f["headers"], json=f["ticket_data"] | changes).status_code
            == 422
        )
    assert (
        client.post(
            base, headers=f["headers"], json=f["ticket_data"] | {"quantity_limit": 13}
        ).status_code
        == 409
    )
    hidden = client.post(
        base, headers=f["headers"], json=f["ticket_data"] | {"name": "Hidden", "is_hidden": True}
    )
    assert hidden.status_code == 201
    assert (
        client.post(API + f"/events/{f['event']['id']}/publish", headers=f["headers"]).status_code
        == 200
    )
    assert len(client.get(base).json()) == 1
    assert len(client.get(base, headers=f["headers"]).json()) == 2
    assert (
        client.put(
            base + "/" + f["ticket"]["id"],
            headers=f["headers"],
            json=f["ticket_data"] | {"is_hidden": True},
        ).status_code
        == 409
    )


def test_assigned_seating_and_capacity_rules(client, setup):
    f = setup(assigned=True)
    eid, tid, headers = f["event"]["id"], f["ticket"]["id"], f["headers"]
    assert client.post(API + f"/events/{eid}/publish", headers=headers).status_code == 409
    assert (
        client.post(
            API + f"/events/{eid}/seats/configure",
            headers=headers,
            json={"ticket_types": {"premium": tid, "standard": tid}},
        ).status_code
        == 200
    )
    assert client.post(API + f"/events/{eid}/publish", headers=headers).status_code == 200
    seats = client.get(API + f"/events/{eid}/seats").json()["items"]
    assert len(seats) == 12 and sum(s["is_accessible"] for s in seats) == 2
    assert all(s["status"] == "available" for s in seats)
    assert (
        client.patch(
            API + f"/events/{eid}/seats/{seats[0]['id']}",
            headers=headers,
            json={"is_blocked": True},
        ).status_code
        == 200
    )
    assert client.get(API + f"/events/{eid}/seats").json()["items"][0]["status"] == "blocked"
    assert (
        client.put(
            API + f"/events/{eid}/ticket-types/{tid}",
            headers=headers,
            json=f["ticket_data"] | {"quantity_limit": 10},
        ).status_code
        == 409
    )
    assert (
        client.put(
            API + f"/events/{eid}",
            headers=headers,
            json=f["data"] | {"seating_mode": "general", "venue_layout_id": None},
        ).status_code
        == 409
    )


def test_duplicate_has_fresh_ids_and_no_staff_or_inventory(client, setup, factory):
    f = setup(assigned=True)
    eid, tid, headers = f["event"]["id"], f["ticket"]["id"], f["headers"]
    client.post(
        API + f"/events/{eid}/seats/configure",
        headers=headers,
        json={"ticket_types": {"premium": tid, "standard": tid}},
    )
    client.post(API + f"/events/{eid}/publish", headers=headers)
    r = client.post(API + f"/events/{eid}/duplicate", headers=headers)
    assert r.status_code == 201, r.text
    copied = r.json()
    assert copied["id"] != eid and copied["publication_state"] == "draft"
    assert copied["calendar_uid"] != f["event"]["calendar_uid"]
    types = client.get(API + f"/events/{copied['id']}/ticket-types", headers=headers).json()
    assert len(types) == 1 and types[0]["id"] != tid
    assert (
        len(client.get(API + f"/events/{copied['id']}/seats", headers=headers).json()["items"])
        == 12
    )
    with factory() as db:
        assert (
            db.scalar(
                select(func.count(EventStaff.id)).where(EventStaff.event_id == UUID(copied["id"]))
            )
            == 0
        )
        assert (
            db.scalar(
                select(func.count(Allocation.id)).where(Allocation.event_id == UUID(copied["id"]))
            )
            == 0
        )


def add_allocation(factory, f, state="held", seat_id=None):
    with factory.begin() as db:
        hold = Hold(
            event_id=UUID(f["event"]["id"]),
            buyer_user_id=UUID(f["org"]["owner_user_id"]),
            expires_at=now() + timedelta(minutes=10),
        )
        db.add(hold)
        db.flush()
        allocation = Allocation(
            event_id=hold.event_id,
            hold_id=hold.id,
            ticket_type_id=UUID(f["ticket"]["id"]),
            event_seat_id=UUID(seat_id) if seat_id else None,
            state=state,
        )
        db.add(allocation)
        db.flush()
        return allocation.id


def test_allocated_capacity_and_cancellation_guards(client, setup, factory):
    f = setup()
    allocation = add_allocation(factory, f)
    eid, tid, headers = f["event"]["id"], f["ticket"]["id"], f["headers"]
    assert (
        client.put(
            API + f"/events/{eid}", headers=headers, json=f["data"] | {"capacity": 0}
        ).status_code
        == 409
    )
    assert (
        client.put(
            API + f"/events/{eid}/ticket-types/{tid}",
            headers=headers,
            json=f["ticket_data"] | {"quantity_limit": 0},
        ).status_code
        == 409
    )
    with factory.begin() as db:
        db.get(Allocation, allocation).state = "sold"
    assert client.post(API + f"/events/{eid}/cancel", headers=headers).status_code == 409
    with factory.begin() as db:
        db.get(Allocation, allocation).state = "held"
    assert client.post(API + f"/events/{eid}/cancel", headers=headers).status_code == 200
    with factory() as db:
        assert db.get(Allocation, allocation).state == "released"
        assert db.scalar(select(Hold)).status == "released"
    assert client.post(API + f"/events/{eid}/publish", headers=headers).status_code == 409
    assert client.put(API + f"/events/{eid}", headers=headers, json=f["data"]).status_code == 409


def test_database_cross_scope_and_live_seat_uniqueness(client, setup, factory, account, settings):
    a, b = setup(assigned=True), setup()
    member, _ = invite_member(client, factory, settings, b, account)
    with pytest.raises(IntegrityError), factory.begin() as db:
        db.add(
            EventStaff(
                event_id=UUID(a["event"]["id"]),
                organization_id=UUID(a["org"]["id"]),
                member_id=UUID(member["id"]),
            )
        )
    eid, tid = a["event"]["id"], a["ticket"]["id"]
    client.post(
        API + f"/events/{eid}/seats/configure",
        headers=a["headers"],
        json={"ticket_types": {"standard": tid, "premium": tid}},
    )
    seat = client.get(API + f"/events/{eid}/seats", headers=a["headers"]).json()["items"][0]
    add_allocation(factory, a, seat_id=seat["id"])
    with pytest.raises(IntegrityError):
        add_allocation(factory, a, seat_id=seat["id"])
    assert (
        client.patch(
            API + f"/events/{eid}/seats/{seat['id']}",
            headers=a["headers"],
            json={"is_blocked": True},
        ).status_code
        == 409
    )
    with pytest.raises(IntegrityError), factory.begin() as db:
        db.add(
            AuditLog(
                actor_user_id=UUID(a["org"]["owner_user_id"]),
                organization_id=UUID(b["org"]["id"]),
                event_id=UUID(eid),
                action="invalid",
                entity_type="event",
                entity_id=UUID(eid),
                description="invalid",
                correlation_id=uuid4(),
            )
        )


def test_concurrent_invitation_acceptance_creates_one_membership(
    client, setup, app, account, factory, settings
):
    f = setup()
    email, _, headers = account()
    invitation = client.post(
        API + f"/organizations/{f['org']['id']}/invitations",
        headers=f["headers"],
        json={"email": email},
    ).json()
    token = challenge_value(settings, "staff_invite", invitation["id"])

    def accept(_):
        with TestClient(app) as other:
            return other.post(
                API + "/staff-invitations/accept", headers=headers, json={"token": token}
            ).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(accept, range(2))) == [200, 400]
    with factory() as db:
        assert (
            db.scalar(
                select(func.count(Member.id)).where(Member.organization_id == UUID(f["org"]["id"]))
            )
            == 2
        )


def test_seed_is_repeatable_and_layout_is_readable(client, factory):
    seed_catalog(factory)
    seed_catalog(factory)
    assert len(client.get(API + "/categories").json()) == 2
    venues = client.get(API + "/venues").json()
    assert len(venues) == 1
    layouts = client.get(API + f"/venues/{venues[0]['id']}/layouts").json()
    r = client.get(API + f"/venues/{venues[0]['id']}/layouts/{layouts[0]['id']}")
    assert len(r.json()["seats"]) == 12


def test_delegated_editor_keeps_new_draft_access(client, setup, account, factory, settings):
    f = setup()
    member, editor = invite_member(client, factory, settings, f, account)
    oid = f["org"]["id"]
    assert (
        client.put(
            API + f"/organizations/{oid}/members/{member['id']}/permissions",
            headers=f["headers"],
            json={"capabilities": ["manage_profile"]},
        ).status_code
        == 200
    )
    created = client.post(API + f"/organizations/{oid}/events", headers=editor, json=f["data"])
    assert created.status_code == 201
    eid = created.json()["id"]
    duplicate = client.post(API + f"/events/{eid}/duplicate", headers=editor)
    assert duplicate.status_code == 201
    assert (
        client.put(
            API + f"/events/{duplicate.json()['id']}",
            headers=editor,
            json=f["data"] | {"title": "Edited copy"},
        ).status_code
        == 200
    )
    # Creating a draft grants editing, never permission to invite or appoint staff.
    assert client.get(API + f"/events/{eid}/staff", headers=editor).status_code == 403
    assert client.get(API + f"/organizations/{oid}/members", headers=editor).status_code == 403


def test_staff_delegation_cannot_grant_or_remove_unheld_capabilities(
    client, setup, account, factory, settings
):
    f = setup()
    manager, manager_headers = invite_member(client, factory, settings, f, account)
    target, _ = invite_member(client, factory, settings, f, account)
    path = API + f"/events/{f['event']['id']}/staff"
    assert (
        client.put(
            path,
            headers=f["headers"],
            json={"member_id": manager["id"], "capabilities": ["staff", "scan"]},
        ).status_code
        == 200
    )
    assert (
        client.put(
            path,
            headers=manager_headers,
            json={"member_id": target["id"], "capabilities": ["event_edit"]},
        ).status_code
        == 403
    )
    assert (
        client.put(
            path,
            headers=manager_headers,
            json={"member_id": target["id"], "capabilities": ["scan"]},
        ).status_code
        == 200
    )
    strong = client.put(
        path,
        headers=f["headers"],
        json={"member_id": target["id"], "capabilities": ["event_edit", "scan"]},
    )
    assert strong.status_code == 200
    assert (
        client.put(
            path,
            headers=manager_headers,
            json={"member_id": target["id"], "capabilities": ["scan"]},
        ).status_code
        == 403
    )
    assert (
        client.delete(path + "/" + strong.json()["id"], headers=manager_headers).status_code == 403
    )
    assert len(client.get(path, headers=manager_headers).json()) == 2


def test_released_allocation_keeps_layout_identity(client, setup, factory):
    f = setup()
    allocation = add_allocation(factory, f)
    with factory.begin() as db:
        row = db.get(Allocation, allocation)
        row.state, row.released_at, row.release_reason = "released", now(), "abandoned"
    r = client.put(
        API + f"/events/{f['event']['id']}",
        headers=f["headers"],
        json=f["data"]
        | {"seating_mode": "assigned", "venue_layout_id": str(seed_id("layout-campus"))},
    )
    assert r.status_code == 409 and r.json()["detail"]["code"] == "layout_already_in_use"


def test_inviter_permission_loss_invalidates_pending_invites(
    client, setup, account, factory, settings
):
    f = setup()
    member, manager = invite_member(client, factory, settings, f, account)
    oid = f["org"]["id"]
    permissions = API + f"/organizations/{oid}/members/{member['id']}/permissions"
    client.put(permissions, headers=f["headers"], json={"capabilities": ["manage_staff"]})
    email, _, invited = account()
    invitation = client.post(
        API + f"/organizations/{oid}/invitations", headers=manager, json={"email": email}
    ).json()
    client.put(permissions, headers=f["headers"], json={"capabilities": []})
    messages = []
    while deliver_once(factory, settings, messages.append):
        pass
    assert not any(
        m["To"] == email and m["Subject"] == "BiletFlow organizer invitation" for m in messages
    )
    assert (
        client.post(
            API + "/staff-invitations/accept",
            headers=invited,
            json={"token": challenge_value(settings, "staff_invite", invitation["id"])},
        ).status_code
        == 403
    )


def test_failed_seat_setup_rolls_back_and_history_is_scoped(client, setup):
    f = setup(assigned=True)
    eid, tid = f["event"]["id"], f["ticket"]["id"]
    assert (
        client.put(
            API + f"/events/{eid}/ticket-types/{tid}",
            headers=f["headers"],
            json=f["ticket_data"] | {"quantity_limit": 6},
        ).status_code
        == 200
    )
    assert (
        client.post(
            API + f"/events/{eid}/seats/configure",
            headers=f["headers"],
            json={"ticket_types": {"standard": tid, "premium": tid}},
        ).status_code
        == 409
    )
    assert client.get(API + f"/events/{eid}/seats", headers=f["headers"]).json()["items"] == []
    history = client.get(API + f"/events/{eid}/history", headers=f["headers"])
    assert history.status_code == 200
    assert all(row["event_id"] == eid for row in history.json())
    assert "event.seats_configured" not in [row["action"] for row in history.json()]
