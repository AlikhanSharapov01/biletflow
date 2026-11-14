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
import { OrderPayment } from "./components/OrderPayment";
import { PriceSummary } from "./components/PriceSummary";
import { RefundList } from "./components/RefundList";
import { orderStart, orderStatusTone, orderTitle, paymentLabel, paymentTone } from "./utils/payment";

export function OrderScreen() {
  const { orderId = "" } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const order = useRequest(() => getOrder(orderId), [orderId]);
  const data = order.data;

  if (!data) {
    return (
      <ScrollScreen backLabel="Orders">
        {order.loading ? <LoadingState message="Loading order…" /> : null}
        {order.error ? <ErrorPanel title="We couldn’t load this order." message={order.error} onRetry={order.reload} /> : null}
      </ScrollScreen>
    );
  }

  const start = orderStart(data);
  const venueName = data.items[0]?.ticket?.venue_name;
  const refunds = data.refunds ?? [];
  const awaitingPayment = data.status === "pending" && Boolean(data.payment);

  return (
    <ScrollScreen backLabel="Orders" onRefresh={order.reload} refreshing={order.loading}>
      <PageHeading
        eyebrow={`Order · ${dateLabel(data.created_at)}`}
        title={orderTitle(data)}
        subtitle={`${start ? dateLabel(start) : ""}${venueName ? ` · ${venueName}` : ""}`}
        actions={
          <>
            <StatusPill tone={orderStatusTone(data.status)} label={statusLabel(data.status)} />
            <SubtleButton
              label="Event page"
              onPress={() => router.push({ pathname: "/events/[eventId]", params: { eventId: data.event_id } })}
            />
          </>
        }
      />
      {order.error ? <ErrorPanel title="We couldn’t refresh this order." message={order.error} onRetry={order.reload} /> : null}
      <Panel>
        <PanelHeading title="Summary" trailing={<StatusPill tone={paymentTone(data)} label={paymentLabel(data)} />} />
        <PriceSummary order={data} />
        <FactList
          items={[
            { label: "Confirmed", value: dateLabel(data.confirmed_at) },
            { label: "Tickets", value: data.items.length },
            ...(data.promo ? [{ label: "Promo code", value: data.promo.code }] : []),
          ]}
        />
        <Text style={styles.copy}>Demonstration order. Payments on BiletFlow’s academic MVP are simulated; no real money moves.</Text>
        <OrderActions order={data} onChanged={order.reload} />
      </Panel>
      {awaitingPayment ? <OrderPayment order={data} onSettled={order.reload} /> : null}
      {refunds.length > 0 ? (
        <Panel>
          <PanelHeading title="Refunds" />
          <RefundList refunds={refunds} />
        </Panel>
      ) : null}
      <Panel>
        <PanelHeading title="Tickets in this order" />
        {data.items.length === 0 || data.status !== "confirmed" ? (
          <Text style={styles.copy}>Tickets are issued once the order is confirmed.</Text>
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
