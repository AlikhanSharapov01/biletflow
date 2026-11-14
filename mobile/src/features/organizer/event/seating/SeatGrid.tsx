import { Pressable, StyleSheet, Text, View } from "react-native";

import type { TicketType } from "@/api/types";
import type { SeatAvailability, VenueLayout } from "@/api/types/seating";
import { colors, fonts } from "@/theme";
import { statusLabel } from "@/utils/format";

import { seatName, seatPosition } from "../../utils/seating";
import { SEAT_COLORS } from "./seatColors";
import { t, useLocale } from "@/i18n";

const SEAT = 20;

interface SeatGridProps {
  layout: VenueLayout;
  seats: SeatAvailability[];
  types: TicketType[];
  selectedId: string;
  onSelect: (seatId: string) => void;
}

// Seats drawn at their layout coordinates. Each seat is a button with a full
// spoken label, so the map works with a screen reader.
export function SeatGrid({ layout, seats, types, selectedId, onSelect }: SeatGridProps) {
  useLocale();
  const canvas = { width: layout.canvas_width, height: layout.canvas_height };
  const typeName = (id: string) => types.find((type) => type.id === id)?.name ?? t("org.unknown_ticket_type");
  const ratio = canvas.width > 0 && canvas.height > 0 ? canvas.width / canvas.height : 2;

  return (
    <View style={styles.wrap}>
      <Text style={styles.stage} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {t("checkout.stage")}
      </Text>
      <View style={[styles.map, { aspectRatio: ratio }]} accessibilityLabel={t("org.seat_map_count", { p0: seats.length })}>
        {seats.map((seat) => {
          const selected = seat.id === selectedId;
          const label = `${seatName(seat)}, ${typeName(seat.ticket_type_id)}, ${statusLabel(seat.status)}${seat.is_accessible ? t("org.accessible_suffix") : ""}`;
          return (
            <Pressable
              key={seat.id}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              hitSlop={4}
              onPress={() => onSelect(selected ? "" : seat.id)}
              style={[styles.seat, seatPosition(seat, canvas), { backgroundColor: SEAT_COLORS[seat.status] }, selected && styles.selected]}
            >
              <Text style={styles.seatText} numberOfLines={1}>
                {seat.is_accessible ? "♿" : seat.seat_label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, paddingRight: SEAT, paddingBottom: SEAT },
  stage: {
    alignSelf: "center",
    paddingVertical: 4,
    paddingHorizontal: 24,
    borderRadius: 4,
    backgroundColor: colors.tabTrack,
    color: colors.muted,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  map: { width: "100%" },
  seat: {
    position: "absolute",
    width: SEAT,
    height: SEAT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 5,
  },
  selected: { borderWidth: 2, borderColor: colors.lime },
  seatText: { color: colors.paper, fontFamily: fonts.sans, fontSize: 8, fontWeight: "700" },
});
