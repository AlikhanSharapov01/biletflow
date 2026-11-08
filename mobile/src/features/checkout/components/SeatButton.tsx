import { Pressable, StyleSheet, Text } from "react-native";

import type { EventSeat } from "@/api/types/checkout";
import { colors, fonts } from "@/theme";
import { SEAT_LOOKS, type SeatLook } from "../utils/seats";
import { SEAT_COLORS } from "./seatColors";

interface SeatButtonProps {
  seat: EventSeat;
  look: SeatLook;
  // e.g. "Standard, ₸5,000.00"
  priceText: string;
  selectable: boolean;
  onToggle: (seat: EventSeat) => void;
}

export function SeatButton({ seat, look, priceText, selectable, onToggle }: SeatButtonProps) {
  const label = [
    `Section ${seat.section_label}, row ${seat.row_label}, seat ${seat.seat_label}`,
    priceText,
    SEAT_LOOKS[look].label,
    seat.is_accessible ? "wheelchair accessible" : "",
  ]
    .filter(Boolean)
    .join(", ");
  const interactive = look === "selected" || (look === "available" && selectable);
  const tone = SEAT_COLORS[look];
  const toggleable = look === "selected" || look === "available";
  return (
    <Pressable
      accessibilityRole={toggleable ? "checkbox" : "button"}
      accessibilityLabel={label}
      accessibilityState={{ disabled: !interactive, checked: toggleable ? look === "selected" : undefined }}
      disabled={!interactive}
      hitSlop={2}
      onPress={() => onToggle(seat)}
      style={({ pressed }) => [
        styles.seat,
        { borderColor: tone.border, backgroundColor: pressed && look === "available" ? colors.activeNav : tone.fill },
        seat.is_accessible && styles.accessible,
      ]}
    >
      <Text style={[styles.glyph, { color: tone.ink }]} numberOfLines={1}>
        {SEAT_LOOKS[look].glyph || (seat.is_accessible ? "♿" : seat.seat_label)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  seat: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  accessible: { borderWidth: 3 },
  glyph: { fontFamily: fonts.sans, fontSize: 11, fontWeight: "700" },
});
