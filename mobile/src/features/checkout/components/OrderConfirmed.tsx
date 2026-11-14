import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import type { Order } from "@/api/types/checkout";
import { PrimaryButton, StatusPill, SubtleButton, TextButton } from "@/components/ui";
import { priceLabel } from "@/utils/format";
import { checkoutStyles } from "./checkoutStyles";
import { quantityLabel, t, useLocale } from "@/i18n";

// After a confirmed order: where to find the tickets and the order receipt.
export function OrderConfirmed({ order, onAgain }: { order: Order; onAgain: () => void }) {
  useLocale();
  const router = useRouter();
  const count = order.items.length;
  const issued = count > 0 ? t("mobile.checkout.tickets_issued", { items: quantityLabel("ticket", count) }) : t("mobile.checkout.tickets_issued_plain");
  const summary = `${issued}${order.payable_minor > 0 ? ` · ${priceLabel(order.payable_minor)} ${order.currency}` : ""}`;
  return (
    <View style={checkoutStyles.stack}>
      <View style={checkoutStyles.head}>
        <Text style={checkoutStyles.heading} accessibilityRole="header">
          {order.payment ? t("mobile.checkout.payment_received") : t("mobile.checkout.registration_confirmed")}
        </Text>
        <StatusPill tone="positive" label={t("common.confirmed")} />
      </View>
      <Text style={checkoutStyles.intro}>
        {t("mobile.checkout.confirmed_note", { summary })}
      </Text>
      <View style={checkoutStyles.actions}>
        <PrimaryButton label={t("mobile.checkout.view_order")} onPress={() => router.push({ pathname: "/orders/[orderId]", params: { orderId: order.id } })} />
        <SubtleButton label={t("mobile.checkout.go_to_tickets")} onPress={() => router.push("/tickets")} />
        <TextButton label={t("mobile.checkout.reserve_more")} onPress={onAgain} style={styles.again} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  again: { alignSelf: "center", paddingVertical: 6 },
});
