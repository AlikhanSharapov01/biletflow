import { t, useLocale } from "../../../i18n";
import { useState } from "react";
import { searchOrders } from "../../../api/admin";
import { Button, Panel, PanelHeading, StatusPill } from "../../../components/ui";
import { dateLabel, priceLabel, statusLabel } from "../../../utils/format";
import { orderTone } from "../../../utils/status";
import { AdminSearchForm } from "../components/AdminSearchForm";
import { InspectionDetail } from "../components/InspectionDetail";
import { SearchResults } from "../components/SearchResults";
import { useAdminSearch } from "../hooks/useAdminSearch";

const STATUSES = ["pending", "confirmed", "failed", "expired", "cancelled", "refund_pending", "refunded"];

export function AdminOrdersPage() {
  useLocale();
  const orders = useAdminSearch(searchOrders);
  const [selected, setSelected] = useState("");
  return (
    <div className="stack">
      <Panel>
        <PanelHeading title={t("common.orders")} subtitle={t("admin.order_search_hint")} />
        <AdminSearchForm label={t("admin.order_search")} placeholder={t("admin.order_search_placeholder")} statuses={STATUSES.map((value) => ({ value, label: statusLabel(value) }))} onApply={orders.apply} />
        <SearchResults noun={t("word.orders")} {...orders} onPage={orders.setOffset}>
          {(items) => (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">{t("common.order")}</th>
                    <th scope="col">{t("admin.buyer")}</th>
                    <th scope="col">{t("common.status")}</th>
                    <th scope="col">{t("admin.payable")}</th>
                    <th scope="col">{t("admin.discount_fee")}</th>
                    <th scope="col">{t("admin.created")}</th>
                    <th scope="col">
                      <span className="visually-hidden">{t("admin.inspect_details")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <code className="id-code">{order.id.slice(0, 8)}</code>
                        <small className="cell-note">{t("word.event")}{" "}{order.event_id.slice(0, 8)}</small>
                      </td>
                      <td>{order.buyer_email}</td>
                      <td>
                        <StatusPill tone={orderTone(order.status)}>{statusLabel(order.status)}</StatusPill>
                      </td>
                      <td>{priceLabel(order.payable_minor)}</td>
                      <td>
                        {priceLabel(order.discount_minor)} · {priceLabel(order.processing_fee_minor)}
                      </td>
                      <td>{dateLabel(order.created_at)}</td>
                      <td>
                        <Button size="sm" onClick={() => setSelected(order.id)}>{t("admin.inspect_view")}</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SearchResults>
      </Panel>
      {selected ? <InspectionDetail key={selected} kind="orders" recordId={selected} title={t("admin.order_detail")} onClose={() => setSelected("")} /> : null}
    </div>
  );
}
