import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text } from "react-native";

import { getOrder } from "@/api/orders";
import { ScrollScreen } from "@/components/layout";
import { ErrorPanel, FactList, LoadingState, PageHeading, Panel, PanelHeading, StatusPill, SubtleButton } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthContext";
import { useRequest } from "@/hooks/useRequest";
import { colors, fonts } from "@/theme";
import { dateLabel, statusLabel } from "@/utils/format";

import { SupportLink } from "../support/components/SupportLink";
import { OrderActions } from "./components/OrderActions";
import { OrderItemRow } from "./components/OrderItemRow";
import { PaymentStep } from "../checkout/components/PaymentStep";
import { PriceSummary } from "../checkout/components/PriceSummary";
import { orderStatusTone, paymentLabel, paymentTone } from "../checkout/utils/payment";
import { RefundList } from "./components/RefundList";
import { orderStart, orderTitle } from "./orderSummary";
import { t, useLocale } from "@/i18n";

export function OrderScreen() {
  useLocale();
  const { orderId = "" } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const order = useRequest(() => getOrder(orderId), [orderId]);
  const data = order.data;

  if (!data) {
    return (
      <ScrollScreen backLabel={t("common.orders")}>
        {order.loading ? <LoadingState message={t("orders.loading_one")} /> : null}
        {order.error ? <ErrorPanel title={t("orders.load_one_error")} message={order.error} onRetry={order.reload} /> : null}
      </ScrollScreen>
    );
  }

  const start = orderStart(data);
  const venueName = data.items[0]?.ticket?.venue_name;
  const refunds = data.refunds ?? [];
  const awaitingPayment = data.status === "pending" && Boolean(data.payment);

  return (
    <ScrollScreen backLabel={t("common.orders")} onRefresh={order.reload} refreshing={order.loading}>
      <PageHeading
        eyebrow={t("orders.order_date", { p0: dateLabel(data.created_at) })}
        title={orderTitle(data)}
        subtitle={`${start ? dateLabel(start) : ""}${venueName ? ` · ${venueName}` : ""}`}
        actions={
          <>
            <StatusPill tone={orderStatusTone(data.status)} label={statusLabel(data.status)} />
            <SubtleButton
              label={t("orders.event_page")}
              onPress={() => router.push({ pathname: "/events/[eventId]", params: { eventId: data.event_id } })}
            />
          </>
        }
      />
      {order.error ? <ErrorPanel title={t("mobile.orders.refresh_error")} message={order.error} onRetry={order.reload} /> : null}
      <Panel>
        <PanelHeading title={t("orders.summary")} trailing={<StatusPill tone={paymentTone(data)} label={paymentLabel(data)} />} />
        <PriceSummary order={data} />
        <FactList
          items={[
            { label: t("common.confirmed"), value: dateLabel(data.confirmed_at) },
            { label: t("common.tickets"), value: data.items.length },
            ...(data.promo ? [{ label: t("checkout.promo_code"), value: data.promo.code }] : []),
          ]}
        />
        <Text style={styles.copy}>{t("orders.demo_notice")}</Text>
        <OrderActions order={data} onChanged={order.reload} />
      </Panel>
      {awaitingPayment ? (
        <Panel>
          <PaymentStep order={data} onConfirmed={order.reload} onClosed={order.reload} />
        </Panel>
      ) : null}
      {refunds.length > 0 ? (
        <Panel>
          <PanelHeading title={t("event.refunds")} />
          <RefundList refunds={refunds} />
        </Panel>
      ) : null}
      <Panel>
        <PanelHeading title={t("orders.tickets_in_order")} />
        {data.items.length === 0 || data.status !== "confirmed" ? (
          <Text style={styles.copy}>{t("orders.issued_after_confirmation")}</Text>
        ) : null}
        {data.items.map((item) => (
          <OrderItemRow
            key={item.id}
            item={item}
            profile={profile}
            onOpenTicket={(ticketId) => router.push({ pathname: "/tickets/[ticketId]", params: { ticketId } })}
          />
        ))}
      </Panel>
      <SupportLink eventId={data.event_id} orderId={data.id} />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  copy: { marginTop: 8, color: colors.muted, fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
});
