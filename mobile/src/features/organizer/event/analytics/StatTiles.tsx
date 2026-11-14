import { StyleSheet, Text, View } from "react-native";

import type { EventAnalytics } from "@/api/types/analytics";
import { colors, fonts, radii } from "@/theme";
import { priceLabel } from "@/utils/format";
import { t, useLocale } from "@/i18n";

function percent(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
}

// Headline figures: a stat tile is clearer than a chart for single numbers.
export function StatTiles({ data }: { data: EventAnalytics }) {
  useLocale();
  const tiles = [
    { label: t("org.tickets_sold"), value: String(data.inventory.sold), note: t("org.capacity_fraction", { p0: percent(data.inventory.sold, data.inventory.capacity), p1: data.inventory.capacity }) },
    { label: t("checkout.available"), value: String(data.inventory.available), note: t("org.in_holds", { p0: data.inventory.held }) },
    { label: t("org.net_revenue"), value: priceLabel(data.revenue.net_minor), note: t("org.gross_amount", { p0: priceLabel(data.revenue.gross_minor) }) },
    { label: t("org.discounts"), value: priceLabel(data.revenue.discount_minor), note: t("org.refunded_amount", { p0: priceLabel(data.revenue.refunds_minor) }) },
    { label: t("tickets.checked_in"), value: String(data.attendance.checked_in), note: t("org.admitted_fraction", { p0: percent(data.attendance.checked_in, data.attendance.issued), p1: data.attendance.issued }) },
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
