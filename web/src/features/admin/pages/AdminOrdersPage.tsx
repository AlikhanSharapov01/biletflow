import { searchOrders } from "../../../api/admin";
import { Panel, PanelHeading, StatusPill } from "../../../components/ui";
import { dateLabel, priceLabel, statusLabel } from "../../../utils/format";
import { orderTone } from "../../../utils/status";
import { AdminSearchForm } from "../components/AdminSearchForm";
import { SearchResults } from "../components/SearchResults";
import { useAdminSearch } from "../hooks/useAdminSearch";

const STATUSES = ["pending", "confirmed", "failed", "expired", "cancelled", "refund_pending", "refunded"];

export function AdminOrdersPage() {
  const orders = useAdminSearch(searchOrders);
  return (
    <Panel>
      <PanelHeading title="Orders" subtitle="Search by buyer email, order id or buyer id. Payment details are never shown." />
      <AdminSearchForm label="Order search" placeholder="buyer@example.com or order id" statuses={STATUSES.map((value) => ({ value, label: statusLabel(value) }))} onApply={orders.apply} />
      <SearchResults noun="orders" {...orders} onPage={orders.setOffset}>
        {(items) => (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Order</th>
                  <th scope="col">Buyer</th>
                  <th scope="col">Status</th>
                  <th scope="col">Payable</th>
                  <th scope="col">Discount · fee</th>
                  <th scope="col">Created</th>
                </tr>
              </thead>
              <tbody>
                {items.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <code className="id-code">{order.id.slice(0, 8)}</code>
                      <small className="cell-note">event {order.event_id.slice(0, 8)}</small>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SearchResults>
    </Panel>
  );
}
