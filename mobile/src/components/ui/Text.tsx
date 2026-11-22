import { StyleSheet, Text, type TextProps } from "react-native";

import { colors, fonts, typography } from "@/theme";
import { useLocale } from "@/i18n";

// Small uppercase label above headings (web .eyebrow).
export function Eyebrow({ style, ...props }: TextProps) {
  useLocale();
  return <Text {...props} style={[styles.eyebrow, style]} />;
}

// System display text for headings (web --font-display); the brand mark alone stays serif.
export function DisplayText({ style, ...props }: TextProps) {
  useLocale();
  return <Text {...props} style={[styles.display, style]} />;
}

const styles = StyleSheet.create({
  eyebrow: {
    color: colors.muted,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  display: {
    color: colors.ink,
    fontFamily: fonts.sans,
    ...typography.cardTitle,
  },
});
