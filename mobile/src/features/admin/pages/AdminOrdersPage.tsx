import { View } from "react-native";

import { searchOrders } from "@/api/admin";
import { ListRow, Panel, PanelHeading, StatusPill } from "@/components/ui";
import { AdminSearchForm } from "@/features/admin/components/AdminSearchForm";
import { RowTitle } from "@/features/admin/components/RowTitle";
import { SearchResults } from "@/features/admin/components/SearchResults";
import { SectionNote } from "@/features/admin/components/SectionNote";
import { useAdminSearch } from "@/features/admin/hooks/useAdminSearch";
import { dateLabel, priceLabel, statusLabel } from "@/utils/format";
import { orderTone } from "@/utils/status";

const STATUSES = ["pending", "confirmed", "failed", "expired", "cancelled", "refund_pending", "refunded"];

// The web shows a table; on the phone each order is one row.
export function AdminOrdersPage() {
  const orders = useAdminSearch(searchOrders);
  return (
    <Panel>
      <PanelHeading title="Orders" />
      <SectionNote text="Search by buyer email, order id or buyer id. Payment details are never shown." />
      <AdminSearchForm
        placeholder="buyer@example.com or order id"
        statuses={STATUSES.map((value) => ({ value, label: statusLabel(value) }))}
        onApply={orders.apply}
      />
      <SearchResults noun="orders" {...orders} onPage={orders.setOffset}>
        {(items) => (
          <View>
            {items.map((order) => (
              <ListRow
                key={order.id}
                icon="O"
                title={
                  <RowTitle text={`Order ${order.id.slice(0, 8)}`}>
                    <StatusPill label={statusLabel(order.status)} tone={orderTone(order.status)} />
                  </RowTitle>
                }
                meta={`${order.buyer_email} · payable ${priceLabel(order.payable_minor)}`}
                note={`Discount ${priceLabel(order.discount_minor)} · fee ${priceLabel(order.processing_fee_minor)} · event ${order.event_id.slice(0, 8)} · ${dateLabel(order.created_at)}`}
              />
            ))}
          </View>
        )}
      </SearchResults>
    </Panel>
  );
}
