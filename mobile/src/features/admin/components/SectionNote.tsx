import { StyleSheet, Text } from "react-native";

import { colors, fonts } from "@/theme";
import { useLocale } from "@/i18n";

// The short explanation under an admin panel title (web panel subtitle).
export function SectionNote({ text }: { text: string }) {
  useLocale();
  return <Text style={styles.note}>{text}</Text>;
}

const styles = StyleSheet.create({
  note: { marginTop: -8, marginBottom: 12, color: colors.muted, fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
});
