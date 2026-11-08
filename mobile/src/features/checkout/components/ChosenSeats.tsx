import { Pressable, StyleSheet, Text, View } from "react-native";

import type { TicketType } from "@/api/types";
import type { EventSeat } from "@/api/types/checkout";
import { colors, fonts } from "@/theme";
import { priceLabel } from "@/utils/format";
import { checkoutStyles } from "./checkoutStyles";

// The seats picked so far, each removable, with the face-value subtotal.
export function ChosenSeats({
  seats,
  typeOf,
  onRemove,
}: {
  seats: EventSeat[];
  typeOf: (seat: EventSeat) => TicketType | undefined;
  onRemove: (seat: EventSeat) => void;
}) {
  const total = seats.reduce((sum, seat) => sum + (typeOf(seat)?.price_minor ?? 0), 0);
  return (
    <View style={styles.list}>
      {seats.map((seat) => (
        <View style={styles.item} key={seat.id}>
          <Text style={styles.place}>
            Section {seat.section_label} · Row {seat.row_label} · Seat {seat.seat_label}
            <Text style={styles.type}> {typeOf(seat)?.name}</Text>
          </Text>
          <Text style={checkoutStyles.price}>{priceLabel(typeOf(seat)?.price_minor ?? 0)}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove seat ${seat.seat_label} in row ${seat.row_label}`}
            hitSlop={8}
            onPress={() => onRemove(seat)}
          >
            <Text style={styles.remove}>Remove</Text>
          </Pressable>
        </View>
      ))}
      <View style={[styles.item, styles.total]}>
        <Text style={[styles.place, styles.totalText]}>Ticket subtotal</Text>
        <Text style={checkoutStyles.price}>{priceLabel(total)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 6 },
  item: { flexDirection: "row", alignItems: "center", gap: 10 },
  place: { flex: 1, color: colors.ink, fontFamily: fonts.sans, fontSize: 14 },
  type: { color: colors.muted, fontSize: 12 },
  total: { paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.lineSoft },
  totalText: { fontWeight: "700" },
  remove: { color: colors.green, fontFamily: fonts.sans, fontSize: 13, fontWeight: "700" },
});
