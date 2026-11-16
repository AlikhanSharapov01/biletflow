"""Consent-aware GA4 collection, deduplicated export and cached aggregates (#71, BF-19, AC-24).

A deterministic fixture stands in for Google. Live-property proof needs real credentials and is
not part of this suite.
"""

import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from urllib.parse import parse_qs, urlsplit
from uuid import UUID, uuid4

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import func, select, update
from test_admission import staff
from test_analytics import analytics
from test_campaign_report_reconciliation import mixed_event, mixed_order
from test_paid_orders import paid_event, pay
from test_refunds import refund, settle

from app import ga4_service
from app.config import Settings
from app.ga4_client import GA4Client, GA4Error, GA4Unavailable
from app.ga4_models import AnalyticsExport, GA4Cache
from app.ga4_service import event_ref, export_ga4_once, scrub_page
from app.security import now

API = "/api/v1"
REPORT = {
    "rows": [
        {
            "dimensionValues": [{"value": "view_item"}],
            "metricValues": [{"value": "40"}, {"value": "25"}],
        },
        {
            "dimensionValues": [{"value": "begin_checkout"}],
            "metricValues": [{"value": "7"}, {"value": "6"}],
        },
        {
            "dimensionValues": [{"value": "purchase"}],
            "metricValues": [{"value": "3"}, {"value": "3"}],
        },
        {
            "dimensionValues": [{"value": "page_view"}],
            "metricValues": [{"value": "99"}, {"value": "9"}],
        },
    ]
}


class FixtureGA4:
    """Deterministic provider: records what would be sent, returns a fixed report."""

    def __init__(self):
        self.sent, self.reports = [], []
        self.outage = self.error = self.rejects = False

    def send(self, payload):
        if self.outage:
            raise GA4Unavailable()
        if self.rejects:
            raise GA4Error()
        self.sent.append(payload)

    def run_report(self, property_id, body):
        self.reports.append((property_id, body))
        if self.outage:
            raise GA4Unavailable()
        if self.error:
            raise GA4Error()
        return REPORT


@pytest.fixture
def ga4(app):
    settings = app.state.settings
    settings.ga4_enabled = True
    settings.ga4_measurement_id = "G-TEST123"
    settings.ga4_api_secret = SecretStr("mp-test-secret")
    settings.ga4_property_id = "123456"
    settings.ga4_credentials_json = SecretStr('{"client_email": "x"}')
    provider = FixtureGA4()
    app.state.ga4 = provider
    return provider


def connection_url(f):
    return API + f"/organizations/{f['org']['id']}/ga4-connection"


def connect(client, f, enabled=True):
    r = client.put(connection_url(f), headers=f["headers"], json={"is_enabled": enabled})
    assert r.status_code == 200, r.text
    return r.json()


def consent(client, headers, value=True):
    r = client.patch(API + "/me", headers=headers, json={"analytics_consent": value})
    assert r.status_code == 200, r.text


def measure(client, headers, f, **extra):
    data = {
        "name": "event_view",
        "analytics_event_id": str(uuid4()),
        "event_id": f["event"]["id"],
        "platform": "web",
    } | extra
    return client.post(API + "/analytics/measurements", headers=headers, json=data)


def traffic(client, f, headers=None, **params):
    return client.get(
        API + f"/events/{f['event']['id']}/analytics/traffic",
        headers=f["headers"] if headers is None else headers,
        params=params,
    )


def run(app, provider):
    return export_ga4_once(app.state.sessions, app.state.settings, provider)


def exports(factory, **where):
    with factory() as db:
        query = select(AnalyticsExport).order_by(AnalyticsExport.created_at)
        for key, value in where.items():
            query = query.where(getattr(AnalyticsExport, key) == value)
        return db.scalars(query).all()


def assert_clean(payloads, forbidden):
    text = json.dumps(payloads)
    for value in forbidden:
        assert str(value) not in text, value


def test_scrub_page_keeps_only_public_route_templates():
    settings = Settings(
        _env_file=None,
        database_url="postgresql+psycopg://localhost/unused_test",
        jwt_secret="j" * 48,
        challenge_secret="c" * 48,
        frontend_url="https://biletflow.example/",
    )
    event = "https://biletflow.example/events/7f1c?token=abc&email=a@b.c#qr"
    assert scrub_page(settings, event) == "https://biletflow.example/events/event"
    assert (
        scrub_page(settings, "/discover?q=private+search") == "https://biletflow.example/discover"
    )
    assert scrub_page(settings, "/") == "https://biletflow.example/discover"
    assert scrub_page(settings, "/c/campaign-link-token") == "https://biletflow.example/c/campaign"
    for private in (
        "/tickets/1",
        "/orders/2",
        "/account",
        "/admin",
        "/support/cases/3",
        "",
        None,
        "//[",
        "http://[::1/events/x",
    ):
        assert scrub_page(settings, private) is None


def test_disabled_by_default_and_checkout_unaffected(client, setup, account, factory, app):
    f = paid_event(client, setup)
    _, _, buyer = account()
    consent(client, buyer)
    r = measure(client, buyer, f)
    assert r.status_code == 202 and r.json() == {"status": "skipped", "reason": "disabled"}
    refused = client.put(connection_url(f), headers=f["headers"], json={"is_enabled": True})
    assert refused.status_code == 409 and refused.json()["detail"]["code"] == "ga4_disabled"
    report = traffic(client, f)
    assert report.status_code == 200, report.text
    assert report.json()["state"] == "disabled" and report.json()["metrics"] is None
    from test_paid_orders import buyer_order

    order, payer, _ = buyer_order(client, account, f)
    consent(client, payer)
    pay(client, payer, order["payment"]["id"], "succeeded")
    provider = FixtureGA4()
    assert run(app, provider) == 0
    assert exports(factory) == [] and provider.sent == []
    assert analytics(client, f).json()["revenue"]["collected_minor"] == order["payable_minor"]


def test_connection_is_owner_scoped_and_disconnects(client, setup, account, settings, ga4):
    f = setup()
    assert client.get(connection_url(f), headers=f["headers"]).json()["is_enabled"] is False
    _, _, outsider = account()
    assert (
        client.put(connection_url(f), headers=outsider, json={"is_enabled": True}).status_code
        == 404
    )
    reporter = staff(client, settings, account, f, ["reports"])
    assert (
        client.put(connection_url(f), headers=reporter, json={"is_enabled": True}).status_code
        == 403
    )
    assert client.get(connection_url(f), headers=reporter).status_code == 403
    made = connect(client, f)
    assert made["is_enabled"] is True and made["property_id"] == "123456"
    assert made["enabled_at"] and made["integration"] == "enabled"
    assert traffic(client, f).json()["state"] == "fresh"
    assert connect(client, f, enabled=False)["is_enabled"] is False
    report = traffic(client, f).json()
    assert report["state"] == "not_connected" and report["metrics"] is None
    assert (
        client.put(connection_url(f), headers=f["headers"], json={"property_id": "9"}).status_code
        == 422
    )


def test_client_measurements_need_consent_allowlist_and_deduplicate(
    client, setup, account, factory, app, ga4
):
    f = paid_event(client, setup)
    connect(client, f)
    email, _, visitor = account()
    assert client.post(API + "/analytics/measurements", json={}).status_code == 401
    r = measure(client, visitor, f)
    assert r.status_code == 202 and r.json() == {"status": "skipped", "reason": "consent_required"}
    assert exports(factory) == []

    consent(client, visitor)
    identifier = str(uuid4())
    page = f"/events/{f['event']['id']}?token=secret-token&email={email}#qr"
    first = measure(client, visitor, f, analytics_event_id=identifier, page_path=page)
    assert first.status_code == 202 and first.json() == {"status": "accepted", "reason": None}
    again = measure(client, visitor, f, analytics_event_id=identifier, page_path=page)
    assert again.json() == {"status": "duplicate", "reason": None}
    hidden = measure(client, visitor, f, name="checkout_start", page_path="/tickets/123")
    assert hidden.json()["status"] == "accepted"
    for bad in (
        {"name": "purchase"},
        {"name": "refund"},
        {"email": email},
        {"platform": "desktop"},
        {"analytics_event_id": "not-a-uuid"},
        {"campaign_id": str(uuid4())},
    ):
        assert measure(client, visitor, f, **bad).status_code == 422, bad
    private = setup(visibility="private")
    published = client.post(
        API + f"/events/{private['event']['id']}/publish", headers=private["headers"]
    )
    assert published.status_code == 200, published.text
    assert measure(client, visitor, private).status_code == 404
    assert len(exports(factory)) == 2

    assert run(app, ga4) == 2
    assert run(app, ga4) == 0
    assert len(ga4.sent) == 2
    first_event, second_event = (payload["events"][0] for payload in ga4.sent)
    assert first_event["name"] == "view_item" and second_event["name"] == "begin_checkout"
    assert first_event["params"]["event_ref"] == event_ref(app.state.settings, f["event"]["id"])
    assert first_event["params"]["page_location"].endswith("/events/event")
    assert "page_location" not in second_event["params"]
    assert set(first_event["params"]) <= {
        "event_ref",
        "campaign_ref",
        "platform",
        "page_location",
        "engagement_time_msec",
    }
    assert all(
        set(payload) == {"client_id", "non_personalized_ads", "events"} for payload in ga4.sent
    )
    me = client.get(API + "/me", headers=visitor).json()
    assert_clean(
        ga4.sent,
        [
            email,
            me["id"],
            me["display_name"],
            f["event"]["id"],
            "secret-token",
            "Campus Concert",
            "Demo event",
        ],
    )
    assert {row.status for row in exports(factory)} == {"sent"}


def test_concurrent_duplicate_measurements_store_one_row(client, setup, account, factory, app, ga4):
    f = paid_event(client, setup)
    connect(client, f)
    _, _, visitor = account()
    consent(client, visitor)
    identifier = str(uuid4())

    def send(_):
        with TestClient(app) as other:
            return measure(other, visitor, f, analytics_event_id=identifier).json()["status"]

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(send, range(8)))
    assert sorted(results) == ["accepted"] + ["duplicate"] * 7
    assert len(exports(factory)) == 1
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda _: run(app, ga4), range(4)))
    assert len(ga4.sent) == 1


def test_measurements_are_rate_limited_and_capped(
    client, setup, account, factory, app, ga4, monkeypatch
):
    f = paid_event(client, setup)
    connect(client, f)
    _, _, refusing = account()
    for _ in range(5):  # refusal is answered before any rate counting
        assert measure(client, refusing, f).json()["reason"] == "consent_required"
    _, _, visitor = account()
    consent(client, visitor)
    monkeypatch.setattr(ga4_service, "MEASUREMENT_LIMIT", 2)
    assert [measure(client, visitor, f).status_code for _ in range(3)] == [202, 202, 429]
    assert len(exports(factory)) == 2
    _, _, other = account()
    consent(client, other)
    monkeypatch.setattr(ga4_service, "PENDING_CAP", 2)
    full = measure(client, other, f)
    assert full.status_code == 202
    assert full.json() == {"status": "skipped", "reason": "backlog_full"}
    assert len(exports(factory)) == 2


def test_malformed_page_path_is_dropped_not_an_error(client, setup, account, app, ga4):
    f = paid_event(client, setup)
    connect(client, f)
    _, _, visitor = account()
    consent(client, visitor)
    r = measure(client, visitor, f, page_path="//[")
    assert r.status_code == 202 and r.json()["status"] == "accepted"
    run(app, ga4)
    assert "page_location" not in ga4.sent[0]["events"][0]["params"]


def test_collect_urls_are_kept_out_of_httpx_logs():
    import logging

    from app.ga4_client import DropCollectRequests

    def record(url):
        return logging.LogRecord(
            "httpx", logging.INFO, "", 0, "HTTP Request: POST %s", (url,), None
        )

    keep = DropCollectRequests()
    assert not keep.filter(
        record("https://www.google-analytics.com/mp/collect?measurement_id=G-1&api_secret=s")
    )
    assert keep.filter(record("https://oauth2.googleapis.com/token"))
    assert any(isinstance(f, DropCollectRequests) for f in logging.getLogger("httpx").filters)


def test_purchase_and_refund_export_once_without_private_data(
    client, setup, account, factory, app, ga4
):
    f, other, campaign = mixed_event(client, setup, paid_event)
    connect(client, f)
    order, buyer = mixed_order(client, account, f, other)
    consent(client, buyer)
    pay(client, buyer, order["payment"]["id"], "succeeded")
    assert run(app, ga4) == 1
    assert run(app, ga4) == 0
    (purchase,) = ga4.sent
    event = purchase["events"][0]
    assert event["name"] == "purchase"
    params = event["params"]
    assert params["currency"] == "KZT" and params["value"] == 5000.00 and params["tickets"] == 2
    assert params["transaction_id"] != order["id"] and params["campaign_ref"]
    assert params["event_ref"] == event_ref(app.state.settings, f["event"]["id"])

    assert refund(client, f, order).status_code == 200
    assert run(app, ga4) == 0  # only a succeeded refund is a measurement
    settle(client, factory, order["id"], buyer)
    assert run(app, ga4) == 1
    assert run(app, ga4) == 0
    refunded = ga4.sent[1]["events"][0]
    assert refunded["name"] == "refund"
    assert refunded["params"]["transaction_id"] == params["transaction_id"]
    assert refunded["params"]["value"] == 5000.00
    assert len(exports(factory, measurement_kind="purchase")) == 1
    assert len(exports(factory, measurement_kind="refund")) == 1

    view = client.get(API + f"/orders/{order['id']}", headers=buyer).json()
    me = client.get(API + "/me", headers=buyer).json()
    forbidden = [
        order["id"],
        order["payment"]["id"],
        me["id"],
        me["email"],
        "ONE",
        "Campus Concert",
    ]
    forbidden += [campaign["id"], f["event"]["id"], f["org"]["id"], "organizer@example.com"]
    for item in view["items"]:
        forbidden += [item["id"], item["recipient_name"], item["recipient_email"]]
        forbidden += [item["ticket"]["id"]] if item["ticket"] else []
    assert_clean(ga4.sent, forbidden)
    with factory() as db:
        stored = [row.safe_payload for row in db.scalars(select(AnalyticsExport))]
    assert_clean(stored, forbidden)


def test_refused_tracking_and_outage_cannot_affect_checkout_or_attribution(
    client, setup, account, factory, app, ga4
):
    f, other, campaign = mixed_event(client, setup, paid_event)
    connect(client, f)
    refused, refused_buyer = mixed_order(client, account, f, other)
    pay(client, refused_buyer, refused["payment"]["id"], "succeeded")
    ga4.outage = True
    order, buyer = mixed_order(client, account, f, other)
    consent(client, buyer)
    pay(client, buyer, order["payment"]["id"], "succeeded")
    for made, headers in ((refused, refused_buyer), (order, buyer)):
        view = client.get(API + f"/orders/{made['id']}", headers=headers)
        assert view.status_code == 200 and view.json()["status"] == "confirmed"
    before = analytics(client, f).json()
    row = next(r for r in before["by_campaign"] if r["campaign_id"] == campaign["id"])
    assert row["redemptions"] == 2 and before["inventory"]["sold"] == 4

    assert run(app, ga4) == 1  # the consenting buyer only; the send fails
    (pending,) = exports(factory)
    assert pending.order_id == UUID(order["id"]) and pending.status == "pending"
    # An outage does not use up an attempt.
    assert pending.attempt_count == 0 and pending.last_error == "ga4_unavailable"
    after = analytics(client, f).json()
    assert after["revenue"] == before["revenue"] and after["by_campaign"] == before["by_campaign"]
    report = traffic(client, f).json()
    assert report["state"] == "unavailable" and report["metrics"] is None

    ga4.outage = False
    with factory.begin() as db:
        db.execute(update(AnalyticsExport).values(available_at=now() - timedelta(seconds=1)))
    assert run(app, ga4) == 1
    assert exports(factory)[0].status == "sent" and len(ga4.sent) == 1


def due(factory):
    with factory.begin() as db:
        db.execute(update(AnalyticsExport).values(available_at=now() - timedelta(seconds=1)))


def paid_consenting_order(client, account, f):
    from test_paid_orders import buyer_order

    order, buyer, _ = buyer_order(client, account, f)
    consent(client, buyer)
    pay(client, buyer, order["payment"]["id"], "succeeded")
    return order


def test_long_outage_never_exhausts_attempts(client, setup, account, factory, app, ga4):
    f = paid_event(client, setup)
    connect(client, f)
    order = paid_consenting_order(client, account, f)
    ga4.outage = True
    for _ in range(12):  # far more passes than MAX_ATTEMPTS
        run(app, ga4)
        due(factory)
    (row,) = exports(factory)
    assert (row.status, row.attempt_count, row.last_error) == ("pending", 0, "ga4_unavailable")
    ga4.outage = False
    assert run(app, ga4) == 1
    (row,) = exports(factory, order_id=UUID(order["id"]))
    assert row.status == "sent" and row.sent_at and row.last_error is None


def test_rejected_sends_fail_after_the_fifth_attempt(client, setup, account, factory, app, ga4):
    f = paid_event(client, setup)
    connect(client, f)
    paid_consenting_order(client, account, f)
    ga4.rejects = True
    for attempt in range(1, 6):
        assert run(app, ga4) == 1
        (row,) = exports(factory)
        assert row.attempt_count == attempt and row.last_error == "ga4_error"
        assert row.status == ("failed" if attempt == 5 else "pending")
        due(factory)
    assert run(app, ga4) == 0  # failed rows stay visible and are not retried
    assert exports(factory)[0].status == "failed" and ga4.sent == []


def test_send_budget_defers_without_using_attempts(
    client, setup, account, factory, app, ga4, monkeypatch
):
    f = paid_event(client, setup)
    connect(client, f)
    for _ in range(2):
        paid_consenting_order(client, account, f)
    monkeypatch.setattr(ga4_service, "SEND_BUDGET_SECONDS", 0)
    run(app, ga4)
    rows = exports(factory)
    assert [(row.status, row.attempt_count) for row in rows] == [("pending", 0)] * 2
    assert ga4.sent == []
    monkeypatch.setattr(ga4_service, "SEND_BUDGET_SECONDS", 5)
    assert run(app, ga4) == 2  # deferred rows are due again at once
    assert len(ga4.sent) == 2


def test_orders_before_connection_and_disconnected_orgs_are_not_exported(
    client, setup, account, factory, app, ga4
):
    f = paid_event(client, setup)
    from test_paid_orders import buyer_order

    early, buyer, _ = buyer_order(client, account, f)
    consent(client, buyer)
    pay(client, buyer, early["payment"]["id"], "succeeded")
    connect(client, f)
    assert run(app, ga4) == 0
    connect(client, f, enabled=False)
    late, buyer2, _ = buyer_order(client, account, f)
    consent(client, buyer2)
    pay(client, buyer2, late["payment"]["id"], "succeeded")
    assert run(app, ga4) == 0 and exports(factory) == []


def test_outage_defers_the_rest_of_the_batch(client, setup, account, factory, app, ga4):
    from test_paid_orders import buyer_order

    f = paid_event(client, setup)
    connect(client, f)
    for _ in range(2):
        order, buyer, _ = buyer_order(client, account, f)
        consent(client, buyer)
        pay(client, buyer, order["payment"]["id"], "succeeded")
    ga4.outage = True
    run(app, ga4)
    rows = exports(factory)
    assert sorted((row.attempt_count, row.last_error or "") for row in rows) == [
        (0, ""),
        (0, "ga4_unavailable"),
    ]
    assert {row.status for row in rows} == {"pending"} and ga4.sent == []


def test_traffic_report_is_scoped_cached_and_labelled(
    client, setup, account, settings, factory, ga4
):
    f = setup()
    connect(client, f)
    params = {"from": "2026-11-01", "to": "2026-11-15"}
    first = traffic(client, f, **params)
    assert first.status_code == 200, first.text
    data = first.json()
    assert data["state"] == "fresh" and data["source"] == "ga4" and data["error"] is None
    assert data["fetched_at"] and data["expires_at"] and data["timezone"]
    assert data["range"] == params
    assert data["metrics"]["event_view"] == {"event_count": 40, "users": 25}
    assert data["metrics"]["checkout_start"] == {"event_count": 7, "users": 6}
    assert data["metrics"]["purchase"] == {"event_count": 3, "users": 3}
    assert data["metrics"]["campaign_landing"] == {"event_count": 0, "users": 0}
    assert "page_view" not in data["metrics"] and data["definitions"]
    property_id, body = ga4.reports[0]
    assert property_id == "123456"
    assert body["dateRanges"] == [{"startDate": "2026-11-01", "endDate": "2026-11-14"}]
    ref = event_ref(settings, f["event"]["id"])
    assert json.dumps(body["dimensionFilter"]).count(ref) == 1
    assert f["event"]["id"] not in json.dumps(body)

    cached = traffic(client, f, **params).json()
    assert cached["state"] == "fresh" and cached["metrics"] == data["metrics"]
    assert datetime.fromisoformat(cached["fetched_at"]) == datetime.fromisoformat(
        data["fetched_at"]
    )
    assert len(ga4.reports) == 1  # served from the cache
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(GA4Cache)) == 1

    with factory.begin() as db:
        db.execute(
            update(GA4Cache).values(
                fetched_at=now() - timedelta(hours=2), expires_at=now() - timedelta(hours=1)
            )
        )
    ga4.outage = True
    stale = traffic(client, f, **params).json()
    assert stale["state"] == "stale" and stale["error"] == "ga4_unavailable"
    assert stale["metrics"] == data["metrics"]
    missing = traffic(client, f, **{"from": "2026-10-01", "to": "2026-10-02"}).json()
    assert missing["state"] == "unavailable" and missing["metrics"] is None
    ga4.outage, ga4.error = False, True
    broken = traffic(client, f, **{"from": "2026-09-01", "to": "2026-09-02"}).json()
    assert (
        broken["state"] == "error" and broken["metrics"] is None and broken["error"] == "ga4_error"
    )
    # Operational analytics never depend on GA4.
    assert analytics(client, f).status_code == 200

    _, _, outsider = account()
    assert traffic(client, f, headers=outsider).status_code == 404
    scanner = staff(client, settings, account, f, ["scan"])
    assert traffic(client, f, headers=scanner).status_code == 403
    reporter = staff(client, settings, account, f, ["reports"])
    assert traffic(client, f, headers=reporter, **params).status_code == 200
    for bad in (
        {"from": "2026-11-15", "to": "2026-11-01"},
        {"from": "2024-01-01", "to": "2026-01-01"},
        {"from": "bad"},
    ):
        assert traffic(client, f, **bad).status_code == 422, bad


def service_account():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    return key.public_key(), json.dumps({"client_email": "reader@project.iam", "private_key": pem})


def client_settings(credentials):
    return Settings(
        _env_file=None,
        database_url="postgresql+psycopg://localhost/unused_test",
        jwt_secret="j" * 48,
        challenge_secret="c" * 48,
        ga4_enabled=True,
        ga4_measurement_id="G-TEST123",
        ga4_api_secret="mp-test-secret",
        ga4_property_id="123456",
        ga4_credentials_json=credentials,
    )


def test_http_client_speaks_measurement_protocol_and_data_api():
    public, credentials = service_account()
    seen = []

    def handler(request):
        seen.append(request)
        if request.url.host == "oauth2.googleapis.com":
            form = parse_qs(request.content.decode())
            claims = jwt.decode(
                form["assertion"][0],
                public,
                algorithms=["RS256"],
                audience="https://oauth2.googleapis.com/token",
            )
            assert claims["iss"] == "reader@project.iam"
            assert claims["scope"] == "https://www.googleapis.com/auth/analytics.readonly"
            return httpx.Response(200, json={"access_token": "token-1", "expires_in": 3600})
        if request.url.host == "www.google-analytics.com":
            return httpx.Response(204)
        assert request.headers["authorization"] == "Bearer token-1"
        return httpx.Response(200, json=REPORT)

    provider = GA4Client(client_settings(credentials), transport=httpx.MockTransport(handler))
    payload = {
        "client_id": "c",
        "non_personalized_ads": True,
        "events": [{"name": "x", "params": {}}],
    }
    provider.send(payload)
    sent = seen[0]
    assert sent.url.path == "/mp/collect"
    query = parse_qs(urlsplit(str(sent.url)).query)
    assert query == {"measurement_id": ["G-TEST123"], "api_secret": ["mp-test-secret"]}
    assert json.loads(sent.content) == payload
    assert provider.run_report("123456", {"dimensions": []}) == REPORT
    assert provider.run_report("123456", {"dimensions": []}) == REPORT
    assert [r.url.host for r in seen].count("oauth2.googleapis.com") == 1  # token reused
    assert seen[-1].url.path == "/v1beta/properties/123456:runReport"


@pytest.mark.parametrize(
    ("response", "expected"),
    [
        (httpx.Response(503), GA4Unavailable),
        (httpx.Response(429), GA4Unavailable),
        (httpx.Response(403, json={"error": "denied"}), GA4Error),
        (httpx.ConnectError("provider-secret-details"), GA4Unavailable),
    ],
)
def test_http_client_maps_provider_failures(response, expected):
    def handler(request):
        if isinstance(response, Exception):
            raise response
        return response

    _, credentials = service_account()
    provider = GA4Client(client_settings(credentials), transport=httpx.MockTransport(handler))
    with pytest.raises(expected) as raised:
        provider.send({"client_id": "c", "events": []})
    assert "mp-test-secret" not in repr(raised.value)
    with pytest.raises(expected):
        provider.run_report("123456", {})


def test_bad_credentials_are_a_configuration_error():
    provider = GA4Client(client_settings("not json"), transport=httpx.MockTransport(lambda r: None))
    with pytest.raises(GA4Error):
        provider.run_report("123456", {})
