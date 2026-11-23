import type { ReactNode } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { Eyebrow } from "@/components/ui/Text";
import { colors, fonts, typography } from "@/theme";
import { useLocale } from "@/i18n";

// Phones narrower than this get the compact title (web drops --text-title the same way).
const COMPACT_WIDTH = 360;

// Eyebrow, system-font title and a short line of copy (web .page-heading).
export function PageHeading({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  useLocale();
  const compact = useWindowDimensions().width < COMPACT_WIDTH;
  return (
    <View style={styles.heading}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <Text accessibilityRole="header" style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    marginBottom: 20,
  },
  title: {
    marginTop: 6,
    color: colors.ink,
    fontFamily: fonts.sans,
    ...typography.title,
  },
  titleCompact: typography.titleCompact,
  subtitle: {
    marginTop: 8,
    color: colors.muted,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
});
