import type { ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { cardShadow, colors, fonts, radii, spacing, typography } from "@/theme";
import { useLocale } from "@/i18n";

// Borderless paper card with a soft shadow (web .panel); "note" is the pale green aside variant
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
  useLocale();
  return <View style={[styles.panel, tone === "note" && styles.note, style]}>{children}</View>;
}

// Panel title row with an optional trailing element (web .panel-heading).
export function PanelHeading({ title, trailing }: { title: string; trailing?: ReactNode }) {
  useLocale();
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
    borderRadius: radii.panel,
    backgroundColor: colors.paper,
    ...cardShadow,
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
    ...typography.panelTitle,
  },
});
