"""Organizer analytics CSV export (#81): same filters, same numbers as the JSON reports."""

import csv
import io
from datetime import datetime
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select
from test_admission import staff
from test_analytics import analytics
from test_campaign_report_reconciliation import mixed_event, mixed_order
from test_campaigns import body as campaign_body
from test_campaigns import create as create_campaign
from test_campaigns import path
from test_paid_orders import PRICE, paid_event, pay
from test_refunds import refund, settle

from app import analytics_service
from app.models import AuditLog

API = "/api/v1"
COLUMNS = ["section", "dimension_id", "dimension_name", "metric", "value"]


def export(client, f, headers=None, **params):
    return client.get(
        API + f"/events/{f['event']['id']}/analytics/export.csv",
        headers=f["headers"] if headers is None else headers,
        params=params,
    )


def parsed(response):
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/csv")
    assert "attachment" in response.headers["content-disposition"]
    text = response.content.decode("utf-8")
    assert text.startswith("﻿")
    reader = csv.reader(io.StringIO(text[1:]))
    header = next(reader)
    assert header == COLUMNS
    return [dict(zip(COLUMNS, row, strict=True)) for row in reader]


def section(rows, name):
    return {row["metric"]: row["value"] for row in rows if row["section"] == name}


def dimension(rows, name):
    out = {}
    for row in rows:
        if row["section"] == name:
            out.setdefault(row["dimension_id"], {"name": row["dimension_name"]})[row["metric"]] = (
                row["value"]
            )
    return out


def cell(value):
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def instant(value):
    return datetime.fromisoformat(value)


def assert_reconciles(client, f, rows, bucket="day", **params):
    """Every exported number equals the canonical summary and series for the same filters."""
    summary = analytics(client, f, **params).json()
    series = client.get(
        API + f"/events/{f['event']['id']}/analytics/sales-series",
        headers=f["headers"],
        params=params | {"bucket": bucket},
    ).json()
    for name in ("inventory", "revenue", "attendance"):
        exported = section(rows, name)
        for key, value in summary[name].items():
            if key == "environments":
                assert exported[key] == ";".join(value)
            elif isinstance(value, float):
                assert float(exported[key]) == pytest.approx(value)
            else:
                assert exported[key] == cell(value), (name, key)
    types = dimension(rows, "ticket_type")
    assert set(types) == {row["ticket_type_id"] for row in summary["by_ticket_type"]}
    for row in summary["by_ticket_type"]:
        exported = types[row["ticket_type_id"]]
        for key in ("capacity", "sold", "checked_in", "revenue_minor"):
            assert exported[key] == cell(row[key])
    campaigns = dimension(rows, "campaign")
    assert set(campaigns) == {cell(row["campaign_id"]) for row in summary["by_campaign"]}
    for row in summary["by_campaign"]:
        exported = campaigns[cell(row["campaign_id"])]
        assert exported["name"] == row["name"]
        for key, value in row.items():
            if key not in ("campaign_id", "name"):
                assert exported[key] == cell(value), key
    points = {instant(key): value for key, value in dimension(rows, "sales_series").items()}
    assert len(points) == len(series["points"])
    for point in series["points"]:
        exported = points[instant(point["bucket_start"])]
        assert exported["tickets"] == cell(point["tickets"])
        assert exported["revenue_minor"] == cell(point["revenue_minor"])
    meta = section(rows, "metadata")
    assert meta["event_id"] == f["event"]["id"] and meta["timezone"] == summary["timezone"]
    assert meta["bucket"] == bucket
    for key in ("ticket_type_id", "campaign_id"):
        assert meta[key] == cell(summary["filters"][key])
    for key in ("from", "to"):
        value = summary["filters"][key]
        assert (instant(meta[key]) if meta[key] else None) == (value and instant(value))
    assert section(rows, "definition") == summary["definitions"]
    return summary


def test_mixed_basket_refund_and_rebuy_reconcile(client, setup, account, factory):
    f, other, campaign = mixed_event(client, setup, paid_event)
    first, buyer = mixed_order(client, account, f, other)
    pay(client, buyer, first["payment"]["id"], "succeeded")
    assert refund(client, f, first).status_code == 200
    # Pending refund obligations are exported separately from completed refunds.
    rows = parsed(export(client, f))
    summary = assert_reconciles(client, f, rows)
    assert summary["revenue"]["pending_refunds_minor"] == PRICE + 100001 - 1
    settle(client, factory, first["id"], buyer)
    second, buyer2 = mixed_order(client, account, f, other)
    pay(client, buyer2, second["payment"]["id"], "succeeded")

    rows = parsed(export(client, f))
    summary = assert_reconciles(client, f, rows)
    revenue = section(rows, "revenue")
    assert revenue["refunds_minor"] == cell(PRICE + 100001 - 1)
    assert revenue["net_minor"] == cell(PRICE + 100001 - 1 - 15000)
    # Campaign rows (attributed + "Unattributed") add up to the event net.
    campaigns = dimension(rows, "campaign")
    assert sum(int(row["revenue_minor"]) for row in campaigns.values()) == int(revenue["net_minor"])
    assert campaigns[campaign["id"]]["refunded_tickets"] == "1"
    assert campaigns[""]["name"] == "Unattributed"

    for params in (
        {"campaign_id": campaign["id"]},
        {"ticket_type_id": other["id"]},
        {"from": "2020-01-01T00:00:00Z", "to": "2100-01-01T00:00:00+05:00"},
    ):
        filtered = parsed(export(client, f, bucket="hour", **params))
        assert_reconciles(client, f, filtered, bucket="hour", **params)
    attributed = section(parsed(export(client, f, campaign_id=campaign["id"])), "revenue")
    assert attributed["collected_minor"] == cell(2 * (PRICE - 1))


def test_metadata_definitions_and_simulation_context(client, setup, account):
    f = paid_event(client, setup)
    rows = parsed(export(client, f))
    meta = section(rows, "metadata")
    assert meta["generated_at"] and meta["timezone"] == f["event"]["time_zone"]
    assert meta["currency"] == "KZT" and meta["money_unit"] == "1/100 KZT"
    assert meta["simulation_notice"]
    assert set(section(rows, "definition")) >= {"net_minor", "campaign", "series", "range"}
    from test_paid_orders import buyer_order

    order, buyer, _ = buyer_order(client, account, f)
    pay(client, buyer, order["payment"]["id"], "succeeded")
    revenue = section(parsed(export(client, f)), "revenue")
    assert revenue["environments"] == "simulation" and revenue["simulated"] == "true"


def test_empty_event_exports_zero_totals_and_no_points(client, setup):
    f = setup()
    rows = parsed(export(client, f))
    assert_reconciles(client, f, rows)
    revenue = section(rows, "revenue")
    assert revenue["gross_minor"] == revenue["net_minor"] == "0"
    assert revenue["environments"] == "" and revenue["simulated"] == "false"
    assert section(rows, "inventory")["sold"] == "0"
    assert section(rows, "attendance")["percentage"] in ("0", "0.0")
    assert dimension(rows, "sales_series") == {} and dimension(rows, "campaign") == {}
    assert set(dimension(rows, "ticket_type")) == {f["ticket"]["id"]}


def test_formula_cells_are_neutralized_and_no_private_data_leaks(client, setup, account):
    f, other, campaign = mixed_event(client, setup, paid_event)
    renamed = client.put(
        API + f"/events/{f['event']['id']}/ticket-types/{other['id']}",
        headers=f["headers"],
        json=f["ticket_data"] | {"name": '=HYPERLINK("x")', "kind": "paid", "price_minor": 100001},
    )
    assert renamed.status_code == 200, renamed.text
    changed = client.put(
        path(f, campaign),
        headers=f["headers"],
        json=campaign_body(
            name="@SUM(A1)",
            code=None,
            discount_kind="fixed",
            value=1,
            eligible_ticket_type_ids=[f["paid"]["id"]],
        ),
    )
    assert changed.status_code == 200, changed.text
    order, buyer = mixed_order(client, account, f, other)
    pay(client, buyer, order["payment"]["id"], "succeeded")
    response = export(client, f)
    rows = parsed(response)
    assert dimension(rows, "ticket_type")[other["id"]]["name"] == '\'=HYPERLINK("x")'
    assert dimension(rows, "campaign")[campaign["id"]]["name"] == "'@SUM(A1)"
    for row in rows:
        for value in row.values():
            assert value[:1] not in ("=", "+", "@", "\t", "\r"), row
    text = response.content.decode("utf-8")
    view = client.get(API + f"/orders/{order['id']}", headers=buyer).json()
    private = [order["id"], view["buyer_user_id"], view["hold_id"], order["payment"]["id"]]
    for item in view["items"]:
        private += [item["id"], item["recipient_email"], item["ticket"]["id"]]
    private += ["organizer@example.com", "Demo event", "ONE"]
    for value in private:
        assert value not in text, value


def test_export_is_bounded(client, setup, account, factory, monkeypatch):
    f = paid_event(client, setup)
    monkeypatch.setattr(analytics_service, "LIMIT", 1)
    r = export(client, f)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "analytics_range_too_large"
    with factory() as db:
        assert not db.scalars(select(AuditLog).where(AuditLog.action == "analytics.exported")).all()


def test_export_scope_filters_and_audit(client, setup, account, settings, factory):
    f, other = setup(), setup()
    url = API + f"/events/{f['event']['id']}/analytics/export.csv"
    assert client.get(url).status_code == 401
    _, _, outsider = account()
    assert client.get(url, headers=outsider).status_code == 404
    scanner = staff(client, settings, account, f, ["scan"])
    assert client.get(url, headers=scanner).status_code == 403
    reporter = staff(client, settings, account, f, ["reports"])
    assert export(client, f, headers=reporter).status_code == 200
    # Another organizer's IDs cannot be used as filters.
    assert export(client, f, ticket_type_id=other["ticket"]["id"]).status_code == 422
    assert export(client, f, campaign_id=create_campaign(client, other)["id"]).status_code == 422
    for params in (
        {"campaign_id": str(uuid4())},
        {"from": "2026-10-01T00:00:00"},
        {"from": "2026-10-02T00:00:00Z", "to": "2026-10-01T00:00:00Z"},
        {"bucket": "month"},
    ):
        assert export(client, f, **params).status_code == 422, params
    with factory() as db:
        logged = db.scalars(select(AuditLog).where(AuditLog.action == "analytics.exported")).all()
    assert len(logged) == 1 and logged[0].event_id == UUID(f["event"]["id"])


def test_export_openapi_contract_without_database():
    from app.config import Settings
    from app.main import create_app

    app = create_app(
        Settings(
            _env_file=None,
            database_url="postgresql+psycopg://localhost/unused_test",
            jwt_secret="j" * 48,
            challenge_secret="c" * 48,
        )
    )
    try:
        assert API + "/events/{event_id}/analytics/export.csv" in app.openapi()["paths"]
    finally:
        app.state.engine.dispose()
