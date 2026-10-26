import { Link, useParams } from "react-router";
import { getOrder, listOrders } from "../api/checkout";
import type { Order } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { EmptyState, ErrorPanel, Loading } from "../components/Feedback";
import { useRequest } from "../hooks/useRequest";
import { dateLabel, dayNumber, monthShort, priceLabel, seatLabel, statusLabel } from "../utils/format";

function orderTitle(order: Order): string {
  return order.items[0]?.ticket?.event_title ?? "Event";
}

function orderStart(order: Order): string | null {
  return order.items[0]?.ticket?.event_starts_at ?? null;
}

export function OrdersPage() {
  const orders = useRequest(() => listOrders(), []);

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Your registrations</p>
          <h1 className="serif">Orders.</h1>
          <p>Every registration you made, with the tickets it issued.</p>
        </div>
      </div>
      {orders.loading ? <Loading label="Loading orders…" /> : null}
      {orders.error ? <ErrorPanel title="We couldn’t load your orders." message={orders.error} onRetry={orders.reload} /> : null}
      {orders.data ? (
        <section className="panel">
          {orders.data.length === 0 ? (
            <EmptyState>
              No orders yet. <Link to="/discover">Find an event</Link> and reserve a free ticket.
            </EmptyState>
          ) : (
            <div className="managed-event-list">
              {orders.data.map((order) => {
                const start = orderStart(order);
                return (
                  <div className="managed-event" key={order.id}>
                    <div className="event-date">
                      <b>{start ? dayNumber(start) : "—"}</b>
                      <span>{start ? monthShort(start) : ""}</span>
                    </div>
                    <div className="event-copy">
                      <strong>
                        <Link to={`/orders/${encodeURIComponent(order.id)}`}>{orderTitle(order)}</Link>
                      </strong>
                      <span>
                        {order.items.length} ticket{order.items.length === 1 ? "" : "s"} · {priceLabel(order.payable_minor)} · placed{" "}
                        {dateLabel(order.created_at)}
                      </span>
                    </div>
                    <span className={`status ${order.status === "confirmed" ? "" : "pending"}`}>{statusLabel(order.status)}</span>
                    <Link className="subtle-button compact-action" to={`/orders/${encodeURIComponent(order.id)}`}>
                      Open
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : null}
    </>
  );
}

export function OrderPage() {
  const { orderId = "" } = useParams();
  const { profile } = useAuth();
  const order = useRequest(() => getOrder(orderId), [orderId]);

  if (order.loading) return <Loading label="Loading order…" />;
  if (order.error || !order.data) {
    return <ErrorPanel title="We couldn’t load this order." message={order.error ?? "Unknown error"} onRetry={order.reload} />;
  }
  const data = order.data;
  const start = orderStart(data);

  return (
    <>
      <Link className="back-link" to="/orders">
        ← All orders
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Order · {dateLabel(data.created_at)}</p>
          <h1 className="serif">{orderTitle(data)}</h1>
          <p>
            {start ? dateLabel(start) : ""}
            {data.items[0]?.ticket?.venue_name ? ` · ${data.items[0].ticket.venue_name}` : ""}
          </p>
        </div>
        <div className="heading-actions">
          <span className={`status ${data.status === "confirmed" ? "" : "pending"}`}>{statusLabel(data.status)}</span>
          <Link className="subtle-button" to={`/events/${encodeURIComponent(data.event_id)}`}>
            Event page
          </Link>
        </div>
      </div>
      <div className="content-grid account-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>Summary</h2>
          </div>
          <ul className="event-facts">
            <li>
              <strong>Total</strong>
              {priceLabel(data.payable_minor)} · {data.currency}
            </li>
            <li>
              <strong>Confirmed</strong>
              {dateLabel(data.confirmed_at)}
            </li>
            <li>
              <strong>Tickets</strong>
              {data.items.length}
            </li>
          </ul>
          <p className="form-intro">Demonstration order. No money moves on BiletFlow’s academic MVP.</p>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Tickets in this order</h2>
          </div>
          <div className="managed-event-list">
            {data.items.map((item) => {
              const mine = item.ticket?.qr_payload || (profile && item.recipient_email.toLowerCase() === profile.email.toLowerCase());
              return (
                <div className="managed-event order-item" key={item.id}>
                  <div className="avatar">{item.unit_number}</div>
                  <div className="event-copy">
                    <strong>
                      {item.recipient_name} · {item.ticket_type_name}
                    </strong>
                    <span>
                      {item.recipient_email} · {seatLabel(item.seat_snapshot)}
                    </span>
                  </div>
                  <span className={`status ${item.ticket?.status === "valid" ? "" : "neutral"}`}>
                    {item.ticket ? statusLabel(item.ticket.status) : "pending"}
                  </span>
                  {item.ticket && mine ? (
                    <Link className="subtle-button compact-action" to={`/tickets/${encodeURIComponent(item.ticket.id)}`}>
                      View ticket
                    </Link>
                  ) : (
                    <small className="order-note">Emailed to the recipient</small>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}
