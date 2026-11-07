import { Link } from "react-router";
import { listOrders } from "../../api/orders";
import { ButtonLink, EmptyState, ErrorPanel, EventCard, Loading, PageHeading, Panel, StatusPill } from "../../components/ui";
import { useRequest } from "../../hooks/useRequest";
import { dateLabel, priceLabel, statusLabel } from "../../utils/format";
import { orderStatusTone, paymentLabel } from "../checkout/utils/payment";
import { orderStart, orderTitle } from "./orderSummary";

export function OrdersPage() {
  const orders = useRequest(() => listOrders(), []);

  return (
    <>
      <PageHeading eyebrow="Your registrations" title="Orders." subtitle="Every registration you made, with the tickets it issued." />
      {orders.loading ? <Loading label="Loading orders…" /> : null}
      {orders.error ? <ErrorPanel title="We couldn’t load your orders." message={orders.error} onRetry={orders.reload} /> : null}
      {orders.data ? (
        orders.data.length === 0 ? (
          <Panel>
            <EmptyState>
              No orders yet. <Link to="/discover">Find an event</Link> and reserve a ticket.
            </EmptyState>
          </Panel>
        ) : (
          <div className="event-grid row-grid">
            {orders.data.map((order) => {
              const path = `/orders/${encodeURIComponent(order.id)}`;
              return (
                <EventCard
                  key={order.id}
                  date={orderStart(order)}
                  title={orderTitle(order)}
                  to={path}
                  meta={[
                    `${order.items.length} ticket${order.items.length === 1 ? "" : "s"} · ${priceLabel(order.payable_minor)} · placed ${dateLabel(order.created_at)}`,
                    ...(order.payment ? [paymentLabel(order)] : []),
                  ]}
                  footer={
                    <>
                      <StatusPill tone={orderStatusTone(order.status)}>{statusLabel(order.status)}</StatusPill>
                      <ButtonLink size="sm" to={path}>
                        Open
                      </ButtonLink>
                    </>
                  }
                />
              );
            })}
          </div>
        )
      ) : null}
    </>
  );
}
