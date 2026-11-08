import { StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "@/theme";

import type { TypeCount } from "../../utils/attendees";

export function TypeCounts({ counts }: { counts: TypeCount[] }) {
  return (
    <View style={styles.list} accessibilityLabel="Tickets per ticket type">
      {counts.map((type) => (
        <View key={type.ticketTypeId} style={styles.row}>
          <Text style={styles.name}>{type.name}</Text>
          <Text style={styles.meta}>
            {type.issued} issued · {type.checkedIn} checked in{type.cancelled ? ` · ${type.cancelled} cancelled or refunded` : ""}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 6, marginBottom: 12 },
  row: { gap: 1 },
  name: { color: colors.ink, fontFamily: fonts.sans, fontSize: 13, fontWeight: "700" },
  meta: { color: colors.muted, fontFamily: fonts.sans, fontSize: 12 },
});
