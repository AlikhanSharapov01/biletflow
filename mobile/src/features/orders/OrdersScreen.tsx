import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { listOrders } from "@/api/orders";
import { ScrollScreen } from "@/components/layout";
import { DateTile, EmptyState, ErrorPanel, ListRow, LoadingState, PageHeading, Panel, StatusPill, TextButton } from "@/components/ui";
import { useRequest } from "@/hooks/useRequest";
import { browserTimeZone, dateLabel, priceLabel, statusLabel } from "@/utils/format";

import { orderStart, orderStatusTone, orderTitle, paymentLabel } from "./utils/payment";

export function OrdersScreen() {
  const router = useRouter();
  const orders = useRequest(() => listOrders(), []);

  return (
    <ScrollScreen backLabel="Back" onRefresh={orders.reload} refreshing={orders.loading && orders.data !== null}>
      <PageHeading eyebrow="Your registrations" title="Orders." subtitle="Every registration you made, with the tickets it issued." />
      {orders.loading && !orders.data ? <LoadingState message="Loading orders…" /> : null}
      {orders.error ? <ErrorPanel title="We couldn’t load your orders." message={orders.error} onRetry={orders.reload} /> : null}
      {orders.data ? (
        orders.data.length === 0 ? (
          <Panel>
            <EmptyState message="No orders yet. Find an event and reserve a ticket." />
            <View style={styles.center}>
              <TextButton label="Find an event →" onPress={() => router.navigate("/")} />
            </View>
          </Panel>
        ) : (
          <Panel>
            {orders.data.map((order) => {
              const start = orderStart(order);
              const count = order.items.length;
              return (
                <ListRow
                  key={order.id}
                  icon={start ? <DateTile at={start} timeZone={browserTimeZone()} /> : "#"}
                  title={orderTitle(order)}
                  meta={`${count} ticket${count === 1 ? "" : "s"} · ${priceLabel(order.payable_minor)} · placed ${dateLabel(order.created_at)}`}
                  note={order.payment ? paymentLabel(order) : undefined}
                  trailing={<StatusPill tone={orderStatusTone(order.status)} label={statusLabel(order.status)} />}
                  onPress={() => router.push({ pathname: "/orders/[orderId]", params: { orderId: order.id } })}
                  accessibilityLabel={`Open order for ${orderTitle(order)}`}
                />
              );
            })}
          </Panel>
        )
      ) : null}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", paddingBottom: 8 },
});
