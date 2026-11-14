import { StyleSheet, Text, View } from "react-native";

import type { SeatStatus } from "@/api/types/seating";
import { colors, fonts } from "@/theme";

import { SEAT_COLORS } from "./seatColors";
import { t, useLocale } from "@/i18n";

export function SeatLegend({ counts }: { counts: Record<SeatStatus, number> }) {
  useLocale();
  const items = [
    { color: SEAT_COLORS.available, label: t("mobile.org.seat_available", { p0: counts.available }) },
    { color: SEAT_COLORS.unavailable, label: t("mobile.org.seat_not_on_sale", { p0: counts.unavailable }) },
    { color: SEAT_COLORS.blocked, label: t("mobile.org.seat_blocked", { p0: counts.blocked }) },
    { color: SEAT_COLORS.sold, label: t("mobile.org.seat_held_sold", { p0: counts.sold + counts.held + counts.refund_pending }) },
  ];
  return (
    <View style={styles.legend} accessibilityLabel={t("org.seat_counts")}>
      {items.map((item) => (
        <View key={item.label} style={styles.item}>
          <View style={[styles.dot, { backgroundColor: item.color }]} />
          <Text style={styles.label}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 12 },
  item: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 3 },
  label: { color: colors.muted, fontFamily: fonts.sans, fontSize: 12 },
});
