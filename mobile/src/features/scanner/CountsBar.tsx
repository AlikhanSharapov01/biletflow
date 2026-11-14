import { StyleSheet, Text, View } from "react-native";

import type { AdmissionCounts } from "@/api/types/scanner";
import { colors, fonts } from "@/theme";
import { useLocale } from "@/i18n";
import { t } from "@/i18n";

// "Guests through the door: admitted / registered" (web .checkin-count).
export function CountsBar({ counts }: { counts: AdmissionCounts }) {
  useLocale();
  return (
    <View style={styles.counts}>
      <Text style={styles.countsLabel}>{t("mobile.scan.through_door")}</Text>
      <Text style={styles.countsValue}>
        {counts.admitted}
        <Text style={styles.countsTotal}> / {counts.registered}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  counts: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: colors.paper,
  },
  countsLabel: {
    color: "#8a948d",
    fontFamily: fonts.sans,
    fontSize: 13,
  },
  countsValue: {
    color: colors.ink,
    fontFamily: fonts.serif,
    fontSize: 28,
  },
  countsTotal: {
    color: "#939d95",
    fontFamily: fonts.sans,
    fontSize: 15,
  },
});
