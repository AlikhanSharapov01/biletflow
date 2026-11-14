import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "@/theme";
import { useLocale } from "@/i18n";

// A list-row title followed by status pills.
export function RowTitle({ text, children }: { text: string; children?: ReactNode }) {
  useLocale();
  return (
    <View style={styles.title}>
      <Text style={styles.text}>{text}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  text: { color: colors.ink, fontFamily: fonts.sans, fontSize: 15, fontWeight: "700" },
});
