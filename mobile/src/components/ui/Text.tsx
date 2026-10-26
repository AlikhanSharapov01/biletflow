import { StyleSheet, Text, type TextProps } from "react-native";

import { colors, fonts } from "@/theme";

// Small uppercase label above headings (web .eyebrow).
export function Eyebrow({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.eyebrow, style]} />;
}

// Serif display text (web .serif headings).
export function SerifText({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.serif, style]} />;
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
  serif: {
    color: colors.ink,
    fontFamily: fonts.serif,
    fontWeight: "400",
  },
});
