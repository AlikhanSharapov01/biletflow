import type { ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, fonts, radii, spacing } from "@/theme";

// Bordered paper card (web .panel); "note" is the pale green aside variant
// (web .organizer-note).
export function Panel({
  children,
  tone = "paper",
  style,
}: {
  children: ReactNode;
  tone?: "paper" | "note";
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.panel, tone === "note" && styles.note, style]}>{children}</View>;
}

// Panel title row with an optional trailing element (web .panel-heading).
export function PanelHeading({ title, trailing }: { title: string; trailing?: ReactNode }) {
  return (
    <View style={styles.heading}>
      <Text style={styles.title}>{title}</Text>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    padding: spacing.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.panel,
    backgroundColor: colors.paper,
  },
  note: {
    backgroundColor: colors.note,
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 14,
  },
  title: {
    flex: 1,
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
});
