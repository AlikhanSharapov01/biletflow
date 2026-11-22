import { quantityLabel, t, useLocale } from "../../i18n";
import { Link } from "react-router";
import { listOrders } from "../../api/orders";
import { EmptyState, ErrorPanel, EventCard, PageHeading, SkeletonGrid, Panel, StatusPill } from "../../components/ui";
import { useRequest } from "../../hooks/useRequest";
import { dateLabel, priceLabel, statusLabel } from "../../utils/format";
import { orderStatusTone, paymentLabel } from "../checkout/utils/payment";
import { orderStart, orderTitle } from "./orderSummary";

// Placeholder rows on the first load.
const ROW_SKELETONS = 3;

export function OrdersPage() {
  useLocale();
  const orders = useRequest(() => listOrders(), []);

  return (
    <>
      <PageHeading eyebrow={t("orders.eyebrow")} title={t("orders.title")} subtitle={t("orders.subtitle")} />
      {orders.loading && !orders.data ? <SkeletonGrid row count={ROW_SKELETONS} label={t("orders.loading")} /> : null}
      {orders.error ? <ErrorPanel title={t("orders.load_error")} message={orders.error} onRetry={orders.reload} /> : null}
      {orders.data ? (
        orders.data.length === 0 ? (
          <Panel>
            <EmptyState>{t("orders.empty")}{" "}<Link to="/discover">{t("orders.find_event")}</Link>{" "}{t("orders.register_hint")}{" "}</EmptyState>
          </Panel>
        ) : (
          <div className="event-grid row-grid" aria-busy={orders.loading || undefined} inert={orders.loading}>
            {orders.data.map((order) => {
              const path = `/orders/${encodeURIComponent(order.id)}`;
              return (
                <EventCard
                  key={order.id}
                  date={orderStart(order)}
                  title={orderTitle(order)}
                  to={path}
                  coverLink
                  meta={[
                    t("orders.summary_meta", { items: quantityLabel("ticket", order.items.length), amount: priceLabel(order.payable_minor), date: dateLabel(order.created_at) }),
                    ...(order.payment ? [paymentLabel(order)] : []),
                  ]}
                  footer={
                    <>
                      <StatusPill tone={orderStatusTone(order.status)}>{statusLabel(order.status)}</StatusPill>
                      <span className="event-cue" aria-hidden="true">{t("orders.view")}</span>
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
