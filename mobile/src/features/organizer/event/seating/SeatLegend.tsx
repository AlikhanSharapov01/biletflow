import { StyleSheet, Text, View } from "react-native";

import type { SeatStatus } from "@/api/types/seating";
import { colors, fonts } from "@/theme";

import { SEAT_COLORS } from "./seatColors";

export function SeatLegend({ counts }: { counts: Record<SeatStatus, number> }) {
  const items = [
    { color: SEAT_COLORS.available, label: `${counts.available} available` },
    { color: SEAT_COLORS.unavailable, label: `${counts.unavailable} not on sale` },
    { color: SEAT_COLORS.blocked, label: `${counts.blocked} blocked` },
    { color: SEAT_COLORS.sold, label: `${counts.sold + counts.held + counts.refund_pending} held or sold` },
  ];
  return (
    <View style={styles.legend} accessibilityLabel="Seat counts">
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
