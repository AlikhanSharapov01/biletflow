import { StyleSheet, Text, View } from "react-native";

import type { EventAnalytics } from "@/api/types/analytics";
import { colors, fonts, radii } from "@/theme";
import { priceLabel } from "@/utils/format";

function percent(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
}

// Headline figures: a stat tile is clearer than a chart for single numbers.
export function StatTiles({ data }: { data: EventAnalytics }) {
  const tiles = [
    { label: "Tickets sold", value: String(data.inventory.sold), note: `${percent(data.inventory.sold, data.inventory.capacity)} of ${data.inventory.capacity} capacity` },
    { label: "Available", value: String(data.inventory.available), note: `${data.inventory.held} in checkout holds` },
    { label: "Net revenue", value: priceLabel(data.revenue.net_minor), note: `${priceLabel(data.revenue.gross_minor)} gross` },
    { label: "Discounts", value: priceLabel(data.revenue.discount_minor), note: `${priceLabel(data.revenue.refunds_minor)} refunded` },
    { label: "Checked in", value: String(data.attendance.checked_in), note: `${percent(data.attendance.checked_in, data.attendance.issued)} of ${data.attendance.issued} issued` },
  ];
  return (
    <View style={styles.grid}>
      {tiles.map((tile) => (
        <View key={tile.label} style={styles.tile} accessible accessibilityLabel={`${tile.label}: ${tile.value}, ${tile.note}`}>
          <Text style={styles.label}>{tile.label}</Text>
          <Text style={styles.value}>{tile.value}</Text>
          <Text style={styles.note}>{tile.note}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 12 },
  tile: {
    flexGrow: 1,
    flexBasis: "45%",
    gap: 2,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radii.panel,
    backgroundColor: colors.sidebar,
  },
  label: { color: colors.muted, fontFamily: fonts.sans, fontSize: 12, fontWeight: "600" },
  value: { color: colors.ink, fontFamily: fonts.sans, fontSize: 20, fontWeight: "700" },
  note: { color: colors.faint, fontFamily: fonts.sans, fontSize: 11 },
});
