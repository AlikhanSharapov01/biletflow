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
import { t, useLocale } from "@/i18n";

const STATUSES = ["pending", "confirmed", "failed", "expired", "cancelled", "refund_pending", "refunded"];

// The web shows a table; on the phone each order is one row.
export function AdminOrdersPage() {
  useLocale();
  const orders = useAdminSearch(searchOrders);
  return (
    <Panel>
      <PanelHeading title={t("common.orders")} />
      <SectionNote text={t("admin.order_search_hint")} />
      <AdminSearchForm
        placeholder={t("admin.order_search_placeholder")}
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
                  <RowTitle text={t("mobile.admin.order_title", { p0: order.id.slice(0, 8) })}>
                    <StatusPill label={statusLabel(order.status)} tone={orderTone(order.status)} />
                  </RowTitle>
                }
                meta={t("mobile.admin.order_meta", { p0: order.buyer_email, p1: priceLabel(order.payable_minor) })}
                note={t("mobile.admin.order_note", { p0: priceLabel(order.discount_minor), p1: priceLabel(order.processing_fee_minor), p2: order.event_id.slice(0, 8), p3: dateLabel(order.created_at) })}
              />
            ))}
          </View>
        )}
      </SearchResults>
    </Panel>
  );
}
