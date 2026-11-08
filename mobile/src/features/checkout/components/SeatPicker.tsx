import { useMemo, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { listSeats } from "@/api/checkout";
import type { EventView, TicketType } from "@/api/types";
import type { EventSeat, HoldLine } from "@/api/types/checkout";
import { EmptyState, ErrorPanel, LoadingState, PrimaryButton, SubtleButton } from "@/components/ui";
import { useRequest } from "@/hooks/useRequest";
import { priceLabel } from "@/utils/format";
import { groupSeats, seatHoldLines, selectedOfType } from "../utils/seats";
import { checkoutStyles } from "./checkoutStyles";
import { ChosenSeats } from "./ChosenSeats";
import { FormMessage } from "@/components/ui/FormMessage";
import { SeatLegend } from "./SeatLegend";
import { SeatMap } from "./SeatMap";

interface SeatPickerProps {
  event: EventView;
  tickets: TicketType[];
  busy: boolean;
  message: string;
  promoSlot?: ReactNode;
  onReserve: (lines: HoldLine[]) => void;
}

const MAX_SEATS = 100;

// Assigned seating: pick seats on the map, each priced by its ticket type,
// then hold exactly those seats.
export function SeatPicker({ event, tickets, busy, message, promoSlot, onReserve }: SeatPickerProps) {
  const seats = useRequest(() => listSeats(event.id), [event.id]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const sections = useMemo(() => groupSeats(seats.data ?? []), [seats.data]);
  const typeOf = (seat: EventSeat) => tickets.find((type) => type.id === seat.ticket_type_id);

  if (seats.loading && !seats.data) return <LoadingState message="Loading the seat map…" />;
  if (seats.error || !seats.data) {
    return <ErrorPanel title="We couldn’t load the seat map." message={seats.error ?? "Unknown error"} onRetry={seats.reload} />;
  }
  if (seats.data.length === 0) return <EmptyState message="The organizer has not set up seats for this event yet." />;

  const all = seats.data;
  const chosen = all.filter((seat) => selected.has(seat.id));

  const priceText = (seat: EventSeat) => {
    const type = typeOf(seat);
    return type ? `${type.name}, ${priceLabel(type.price_minor)}` : "Not on sale";
  };

  const canSelect = (seat: EventSeat) => {
    const type = typeOf(seat);
    if (!type || seat.status !== "available" || selected.size >= MAX_SEATS) return false;
    return selectedOfType(all, selected, type.id) < type.per_order_limit;
  };

  const toggle = (seat: EventSeat) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(seat.id)) next.delete(seat.id);
      else next.add(seat.id);
      return next;
    });

  const refresh = () => {
    setSelected(new Set());
    seats.reload();
  };

  const reserveLabel = busy ? "Reserving…" : chosen.length > 0 ? `Reserve ${chosen.length} seat${chosen.length === 1 ? "" : "s"}` : "Reserve seats";

  return (
    <View style={checkoutStyles.stack}>
      <SeatLegend />
      <SeatMap sections={sections} selected={selected} priceText={priceText} canSelect={canSelect} onToggle={toggle} />
      <View accessibilityLiveRegion="polite" style={styles.selection}>
        {chosen.length === 0 ? (
          <Text style={checkoutStyles.intro}>Choose seats on the map. Each ticket type has its own per-order limit.</Text>
        ) : (
          <ChosenSeats seats={chosen} typeOf={typeOf} onRemove={toggle} />
        )}
      </View>
      {promoSlot}
      <FormMessage message={message} />
      <View style={checkoutStyles.actions}>
        <PrimaryButton label={reserveLabel} disabled={busy || chosen.length === 0} onPress={() => onReserve(seatHoldLines(all, selected))} />
        <SubtleButton label="Refresh seats" disabled={busy || seats.loading} onPress={refresh} />
        <Text style={checkoutStyles.intro}>Seats are held for 10 minutes while you add recipients.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  selection: { gap: 8 },
});
