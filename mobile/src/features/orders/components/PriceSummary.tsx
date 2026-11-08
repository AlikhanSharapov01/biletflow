import { StyleSheet, Text, View } from "react-native";

import type { Order } from "@/api/types/checkout";
import { colors, fonts } from "@/theme";
import { priceLabel } from "@/utils/format";

// Subtotal, discount, processing fee and total, straight from the server's
// saved quote. The fee is part of the total (an organizer cost), not extra.
export function PriceSummary({ order }: { order: Order }) {
  const rows: [string, string][] = [["Subtotal", priceLabel(order.gross_minor)]];
  if (order.discount_minor > 0) rows.push(["Discount", `−${priceLabel(order.discount_minor)}`]);
  rows.push(["Processing fee", order.processing_fee_minor > 0 ? `${priceLabel(order.processing_fee_minor)} · included` : "None"]);

  return (
    <View style={styles.list}>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.row}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.value}>{value}</Text>
        </View>
      ))}
      <View style={[styles.row, styles.total]}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>
          {priceLabel(order.payable_minor)} <Text style={styles.currency}>{order.currency}</Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { marginBottom: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 6 },
  label: { color: colors.muted, fontFamily: fonts.sans, fontSize: 14 },
  value: { color: colors.ink, fontFamily: fonts.sans, fontSize: 14 },
  total: { marginTop: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line },
  totalLabel: { color: colors.ink, fontFamily: fonts.sans, fontSize: 15, fontWeight: "700" },
  totalValue: { color: colors.ink, fontFamily: fonts.sans, fontSize: 17, fontWeight: "700" },
  currency: { color: colors.muted, fontSize: 12, fontWeight: "600" },
});
