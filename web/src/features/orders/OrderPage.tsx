import { useParams } from "react-router";
import { getOrder } from "../../api/orders";
import { ButtonLink, ErrorPanel, FactList, Loading, PageHeading, Panel, PanelHeading, StatusPill } from "../../components/ui";
import { useRequest } from "../../hooks/useRequest";
import { dateLabel, statusLabel } from "../../utils/format";
import { useAuth } from "../auth/AuthContext";
import { PaymentStep } from "../checkout/components/PaymentStep";
import { PriceSummary } from "../checkout/components/PriceSummary";
import { orderStatusTone, paymentLabel, paymentTone } from "../checkout/utils/payment";
import { SupportLink } from "../support/components/SupportLink";
import { OrderActions } from "./components/OrderActions";
import { OrderItemRow } from "./components/OrderItemRow";
import { RefundList } from "./components/RefundList";
import { orderStart, orderTitle } from "./orderSummary";

export function OrderPage() {
  const { orderId = "" } = useParams();
  const { profile } = useAuth();
  const order = useRequest(() => getOrder(orderId), [orderId]);

  if (order.loading && !order.data) return <Loading label="Loading order…" />;
  if (order.error || !order.data) {
    return <ErrorPanel title="We couldn’t load this order." message={order.error ?? "Unknown error"} onRetry={order.reload} />;
  }
  const data = order.data;
  const start = orderStart(data);
  const venueName = data.items[0]?.ticket?.venue_name;
  const refunds = data.refunds ?? [];
  const awaitingPayment = data.status === "pending" && Boolean(data.payment);

  return (
    <>
      <PageHeading
        back={{ to: "/orders", label: "All orders" }}
        eyebrow={`Order · ${dateLabel(data.created_at)}`}
        title={orderTitle(data)}
        subtitle={`${start ? dateLabel(start) : ""}${venueName ? ` · ${venueName}` : ""}`}
        actions={
          <>
            <StatusPill tone={orderStatusTone(data.status)}>{statusLabel(data.status)}</StatusPill>
            <ButtonLink to={`/events/${encodeURIComponent(data.event_id)}`}>Event page</ButtonLink>
          </>
        }
      />
      <div className="content-grid account-grid">
        <div className="stack">
          <Panel>
            <PanelHeading title="Summary" trailing={<StatusPill tone={paymentTone(data)}>{paymentLabel(data)}</StatusPill>} />
            <PriceSummary order={data} />
            <FactList
              items={[
                { label: "Confirmed", value: dateLabel(data.confirmed_at) },
                { label: "Tickets", value: data.items.length },
              ]}
            />
            <p className="form-intro">Demonstration order. Payments on BiletFlow’s academic MVP are simulated; no real money moves.</p>
            <OrderActions order={data} onChanged={order.reload} />
          </Panel>
          {refunds.length > 0 ? (
            <Panel>
              <PanelHeading title="Refunds" />
              <RefundList refunds={refunds} />
            </Panel>
          ) : null}
          <SupportLink eventId={data.event_id} orderId={data.id} />
        </div>
        <div className="stack">
          {awaitingPayment ? (
            <Panel>
              <PaymentStep order={data} onConfirmed={order.reload} onClosed={order.reload} />
            </Panel>
          ) : null}
          <Panel>
            <PanelHeading title="Tickets in this order" />
            {data.items.length === 0 || data.status !== "confirmed" ? (
              <p className="form-intro">Tickets are issued once the order is confirmed.</p>
            ) : null}
            <div className="list">
              {data.items.map((item) => (
                <OrderItemRow key={item.id} item={item} profile={profile} />
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
