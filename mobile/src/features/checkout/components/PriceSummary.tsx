import { StyleSheet, Text, View } from "react-native";

import type { Order } from "@/api/types/checkout";
import { colors, fonts } from "@/theme";
import { priceLabel } from "@/utils/format";

// Subtotal, discount, processing fee and total, straight from the server's
// saved quote. The fee is part of the total (an organizer cost), not extra.
export function PriceSummary({ order }: { order: Order }) {
  return (
    <View style={styles.list}>
      <Line label="Subtotal" value={priceLabel(order.gross_minor)} />
      {order.discount_minor > 0 ? <Line label="Discount" value={`−${priceLabel(order.discount_minor)}`} /> : null}
      <Line
        label="Processing fee"
        value={order.processing_fee_minor > 0 ? `${priceLabel(order.processing_fee_minor)} · included` : "None"}
      />
      <View style={[styles.row, styles.total]}>
        <Text style={[styles.label, styles.totalText]}>Total</Text>
        <Text style={[styles.value, styles.totalText]}>
          {priceLabel(order.payable_minor)} <Text style={styles.currency}>{order.currency}</Text>
        </Text>
      </View>
    </View>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  label: { color: colors.muted, fontFamily: fonts.sans, fontSize: 14 },
  value: { color: colors.ink, fontFamily: fonts.sans, fontSize: 14, fontVariant: ["tabular-nums"] },
  total: { paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.lineSoft },
  totalText: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  currency: { color: colors.muted, fontSize: 11, fontWeight: "600" },
});
