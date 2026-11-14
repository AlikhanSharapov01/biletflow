import { StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "@/theme";

import type { TypeCount } from "../../utils/attendees";
import { t, useLocale } from "@/i18n";

export function TypeCounts({ counts }: { counts: TypeCount[] }) {
  useLocale();
  return (
    <View style={styles.list} accessibilityLabel={t("org.ticket_type_counts")}>
      {counts.map((type) => (
        <View key={type.ticketTypeId} style={styles.row}>
          <Text style={styles.name}>{type.name}</Text>
          <Text style={styles.meta}>
            {type.issued} {t("org.issued_suffix")} {type.checkedIn} {t("org.checked_in_lower")}{type.cancelled ? t("org.cancelled_count", { p0: type.cancelled }) : ""}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 6, marginBottom: 12 },
  row: { gap: 1 },
  name: { color: colors.ink, fontFamily: fonts.sans, fontSize: 13, fontWeight: "700" },
  meta: { color: colors.muted, fontFamily: fonts.sans, fontSize: 12 },
});
