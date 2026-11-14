import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { listOrders } from "@/api/orders";
import { ScrollScreen } from "@/components/layout";
import { DateTile, EmptyState, ErrorPanel, ListRow, LoadingState, PageHeading, Panel, StatusPill, TextButton } from "@/components/ui";
import { useRequest } from "@/hooks/useRequest";
import { browserTimeZone, dateLabel, priceLabel, statusLabel } from "@/utils/format";

import { orderStatusTone, paymentLabel } from "../checkout/utils/payment";
import { orderStart, orderTitle } from "./orderSummary";
import { quantityLabel, t, useLocale } from "@/i18n";

export function OrdersScreen() {
  useLocale();
  const router = useRouter();
  const orders = useRequest(() => listOrders(), []);

  return (
    <ScrollScreen backLabel={t("common.back")} onRefresh={orders.reload} refreshing={orders.loading && orders.data !== null}>
      <PageHeading eyebrow={t("orders.eyebrow")} title={t("orders.title")} subtitle={t("orders.subtitle")} />
      {orders.loading && !orders.data ? <LoadingState message={t("orders.loading")} /> : null}
      {orders.error ? <ErrorPanel title={t("orders.load_error")} message={orders.error} onRetry={orders.reload} /> : null}
      {orders.data ? (
        orders.data.length === 0 ? (
          <Panel>
            <EmptyState message={t("mobile.orders.empty")} />
            <View style={styles.center}>
              <TextButton label={t("mobile.orders.find_event")} onPress={() => router.navigate("/")} />
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
                  meta={t("orders.summary_meta", { items: quantityLabel("ticket", count), amount: priceLabel(order.payable_minor), date: dateLabel(order.created_at) })}
                  note={order.payment ? paymentLabel(order) : undefined}
                  trailing={<StatusPill tone={orderStatusTone(order.status)} label={statusLabel(order.status)} />}
                  onPress={() => router.push({ pathname: "/orders/[orderId]", params: { orderId: order.id } })}
                  accessibilityLabel={t("mobile.orders.open_order_for", { p0: orderTitle(order) })}
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
