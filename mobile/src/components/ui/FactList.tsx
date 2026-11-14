import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "@/theme";
import { useLocale } from "@/i18n";

export type Fact = { label: string; value: ReactNode };

// Label/value pairs, e.g. an event's details or an order summary (web .fact-list).
export function FactList({ items }: { items: Fact[] }) {
  useLocale();
  return (
    <View style={styles.list}>
      {items.map((item, index) => (
        <View key={item.label} style={[styles.row, index > 0 && styles.divider]}>
          <Text style={styles.label}>{item.label}</Text>
          {typeof item.value === "string" || typeof item.value === "number" ? (
            <Text style={styles.value}>{item.value}</Text>
          ) : (
            <View style={styles.valueBox}>{item.value}</View>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 0 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 9 },
  divider: { borderTopWidth: 1, borderTopColor: colors.lineSoft },
  label: { color: colors.muted, fontFamily: fonts.sans, fontSize: 13, fontWeight: "600" },
  value: { flexShrink: 1, color: colors.ink, fontFamily: fonts.sans, fontSize: 14, textAlign: "right" },
  valueBox: { flexShrink: 1, alignItems: "flex-end" },
});
