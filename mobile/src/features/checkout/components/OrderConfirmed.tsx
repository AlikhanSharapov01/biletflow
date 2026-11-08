import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import type { Order } from "@/api/types/checkout";
import { PrimaryButton, StatusPill, SubtleButton, TextButton } from "@/components/ui";
import { priceLabel } from "@/utils/format";
import { checkoutStyles } from "./checkoutStyles";

// After a confirmed order: where to find the tickets and the order receipt.
export function OrderConfirmed({ order, onAgain }: { order: Order; onAgain: () => void }) {
  const router = useRouter();
  const count = order.items.length;
  return (
    <View style={checkoutStyles.stack}>
      <View style={checkoutStyles.head}>
        <Text style={checkoutStyles.heading} accessibilityRole="header">
          {order.payment ? "Payment received" : "Registration confirmed"}
        </Text>
        <StatusPill tone="positive" label="Confirmed" />
      </View>
      <Text style={checkoutStyles.intro}>
        {count > 0 ? `${count} ticket${count === 1 ? "" : "s"} issued` : "Your tickets are issued"}
        {order.payable_minor > 0 ? ` · ${priceLabel(order.payable_minor)} ${order.currency}` : ""}. Each recipient gets their ticket by email.
      </Text>
      <View style={checkoutStyles.actions}>
        <PrimaryButton label="View order" onPress={() => router.push({ pathname: "/orders/[orderId]", params: { orderId: order.id } })} />
        <SubtleButton label="Go to my tickets" onPress={() => router.push("/tickets")} />
        <TextButton label="Reserve more tickets" onPress={onAgain} style={styles.again} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  again: { alignSelf: "center", paddingVertical: 6 },
});
