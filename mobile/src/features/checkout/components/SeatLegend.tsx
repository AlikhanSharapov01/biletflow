import { StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "@/theme";
import { SEAT_LOOKS, type SeatLook } from "../utils/seats";
import { SEAT_COLORS } from "./seatColors";

const SHOWN: SeatLook[] = ["available", "selected", "held", "sold", "unavailable"];

// Colour plus a glyph for every state, so the map never relies on colour alone.
export function SeatLegend() {
  return (
    <View style={styles.legend} accessibilityLabel="Seat map legend">
      {SHOWN.map((look) => (
        <Item key={look} look={look} glyph={SEAT_LOOKS[look].glyph} label={SEAT_LOOKS[look].label} />
      ))}
      <Item look="available" glyph="♿" label="Wheelchair accessible" accessible />
    </View>
  );
}

function Item({ look, glyph, label, accessible }: { look: SeatLook; glyph: string; label: string; accessible?: boolean }) {
  const tone = SEAT_COLORS[look];
  return (
    <View style={styles.item}>
      <View
        style={[styles.swatch, { borderColor: tone.border, backgroundColor: tone.fill }, accessible && styles.accessible]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text style={[styles.glyph, { color: tone.ink }]}>{glyph}</Text>
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 8 },
  item: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  accessible: { borderWidth: 3 },
  glyph: { fontFamily: fonts.sans, fontSize: 10, fontWeight: "700" },
  label: { color: colors.muted, fontFamily: fonts.sans, fontSize: 12 },
});
