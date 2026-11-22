import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Eyebrow } from "@/components/ui/Text";
import { colors, fonts, typography } from "@/theme";
import { useLocale } from "@/i18n";

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
  return (
    <View style={styles.heading}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
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
