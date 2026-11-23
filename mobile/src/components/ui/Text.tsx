import { StyleSheet, Text, type TextProps } from "react-native";

import { colors, fonts, typography } from "@/theme";
import { useLocale } from "@/i18n";

// Small uppercase label above headings (web .eyebrow).
export function Eyebrow({ style, ...props }: TextProps) {
  useLocale();
  return <Text {...props} style={[styles.eyebrow, style]} />;
}

// Display sizes start here; from this size up, tracking tightens with the size (web --track-title).
const LARGE_DISPLAY = 24;
const TRACK_TITLE = -0.022;

// System display text for headings (web --font-display); the brand mark alone stays serif.
// A caller that sets only the size gets a proportional line height (1.2x), so large headings never clip,
// and at display sizes a tracking of -0.022em of that size, as large type wants tighter letters.
export function DisplayText({ style, ...props }: TextProps) {
  useLocale();
  const { fontSize, lineHeight, letterSpacing } = StyleSheet.flatten(style) ?? {};
  const derived = {
    ...(fontSize !== undefined && lineHeight === undefined ? { lineHeight: Math.round(fontSize * 1.2) } : null),
    ...(fontSize !== undefined && fontSize >= LARGE_DISPLAY && letterSpacing === undefined
      ? { letterSpacing: Math.round(TRACK_TITLE * fontSize * 100) / 100 }
      : null),
  };
  return <Text {...props} style={[styles.display, style, derived]} />;
}

const styles = StyleSheet.create({
  eyebrow: {
    color: colors.muted,
    fontFamily: fonts.sans,
    fontSize: typography.micro.fontSize,
    fontWeight: "600",
    letterSpacing: typography.micro.fontSize * 0.06,
    textTransform: "uppercase",
  },
  display: {
    color: colors.ink,
    fontFamily: fonts.sans,
    ...typography.cardTitle,
  },
});
