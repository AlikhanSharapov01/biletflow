import { StyleSheet, Text, type TextProps } from "react-native";

import { colors, fonts, typography } from "@/theme";
import { useLocale } from "@/i18n";

// Small uppercase label above headings (web .eyebrow).
export function Eyebrow({ style, ...props }: TextProps) {
  useLocale();
  return <Text {...props} style={[styles.eyebrow, style]} />;
}

// System display text for headings (web --font-display); the brand mark alone stays serif.
// A caller that sets only the size gets a proportional line height (1.2x), so large headings never clip.
export function DisplayText({ style, ...props }: TextProps) {
  useLocale();
  const { fontSize, lineHeight } = StyleSheet.flatten(style) ?? {};
  const derived = fontSize !== undefined && lineHeight === undefined ? { lineHeight: Math.round(fontSize * 1.2) } : null;
  return <Text {...props} style={[styles.display, style, derived]} />;
}

const styles = StyleSheet.create({
  eyebrow: {
    color: colors.muted,
    fontFamily: fonts.sans,
    fontSize: typography.micro.fontSize,
    fontWeight: "700",
    letterSpacing: typography.micro.fontSize * 0.06,
    textTransform: "uppercase",
  },
  display: {
    color: colors.ink,
    fontFamily: fonts.sans,
    ...typography.cardTitle,
  },
});
