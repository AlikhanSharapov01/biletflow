import { StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "@/theme";
import { formatDateTile } from "@/utils/eventTime";

// Sand-coloured day/month block at the start of an event row (web .event-date).
export function DateTile({ at, timeZone }: { at: string; timeZone: string }) {
  const { day, month } = formatDateTile(at, timeZone);
  return (
    <View style={styles.tile}>
      <Text style={styles.day}>{day}</Text>
      <Text style={styles.month}>{month}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 44,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 5,
    backgroundColor: colors.dateTile,
  },
  day: {
    color: colors.dateTileInk,
    fontFamily: fonts.sans,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 18,
  },
  month: {
    marginTop: 2,
    color: colors.dateTileInk,
    fontFamily: fonts.sans,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});
