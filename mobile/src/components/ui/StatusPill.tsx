import { StyleSheet, Text, View } from "react-native";

import { fonts, radii, statusTones, type StatusTone } from "@/theme";

// Rounded status label with a leading dot (web .status).
export function StatusPill({ label, tone = "positive" }: { label: string; tone?: StatusTone }) {
  const { background, color } = statusTones[tone];
  return (
    <View style={[styles.pill, { backgroundColor: background }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.label, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radii.pill,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  label: {
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: "700",
  },
});
