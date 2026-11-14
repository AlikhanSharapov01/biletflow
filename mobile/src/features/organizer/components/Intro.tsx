import type { ReactNode } from "react";
import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";

import { colors, fonts } from "@/theme";
import { useLocale } from "@/i18n";

// Muted explanatory copy under a heading or a form (web .form-intro).
export function Intro({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  useLocale();
  return <Text style={[styles.intro, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  intro: { color: colors.muted, fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
});
