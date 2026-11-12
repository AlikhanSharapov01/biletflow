from uuid import UUID

import pytest
from sqlalchemy import event, func, select
from test_finance import finance, payout
from test_paid_orders import PRICE, buyer_order, paid_event, pay

from app.checkout_models import TicketOrder
from app.commerce_models import Refund
from app.finance_models import DemoPayout


@pytest.mark.parametrize("reserve", [False, True])
def test_cancellation_batches_cash_aggregation(client, setup, account, factory, app, reserve):
    f = paid_event(client, setup)
    orders = []
    for _ in range(4):
        order, buyer, _ = buyer_order(client, account, f)
        pay(client, buyer, order["payment"]["id"], "succeeded")
        orders.append(order)
    identifier = None
    if reserve:
        response = payout(client, f, 1000000)
        assert response.status_code == 201, response.text
        identifier = UUID(response.json()["id"])
    aggregates = []

    def count_cash_queries(conn, cursor, statement, parameters, context, executemany):
        # Observe the actual shared event-wide monetary SQL executed by PostgreSQL.
        if "WITH" in statement.upper() and "FROM items" in statement:
            aggregates.append(statement)

    event.listen(app.state.engine, "before_cursor_execute", count_cash_queries)
    try:
        response = client.post(f"/api/v1/events/{f['event']['id']}/cancel", headers=f["headers"])
        assert response.status_code == 200, response.text
        repeated = client.post(f"/api/v1/events/{f['event']['id']}/cancel", headers=f["headers"])
        assert repeated.status_code == 200, repeated.text
    finally:
        event.remove(app.state.engine, "before_cursor_execute", count_cash_queries)
    assert len(aggregates) == (1 if reserve else 0)
    with factory() as db:
        assert db.scalar(select(func.count(Refund.id))) == len(orders)
        assert db.scalar(select(func.sum(Refund.amount_minor))) == 4 * PRICE
        assert set(db.scalars(select(TicketOrder.status))) == {"refund_pending"}
        if identifier:
            assert db.get(DemoPayout, identifier).status == "failed"
    cash = finance(client, f).json()
    assert cash["collected_minor"] == cash["pending_refunds_minor"] == 4 * PRICE
    assert cash["refunds_minor"] == cash["reserved_minor"] == cash["estimated_payout_minor"] == 0
