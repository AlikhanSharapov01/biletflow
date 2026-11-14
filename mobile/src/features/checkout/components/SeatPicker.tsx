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
import { quantityLabel, t, useLocale } from "@/i18n";

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
  useLocale();
  const seats = useRequest(() => listSeats(event.id), [event.id]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const sections = useMemo(() => groupSeats(seats.data ?? []), [seats.data]);
  const typeOf = (seat: EventSeat) => tickets.find((type) => type.id === seat.ticket_type_id);

  if (seats.loading && !seats.data) return <LoadingState message={t("checkout.seat_map_loading")} />;
  if (seats.error || !seats.data) {
    return <ErrorPanel title={t("checkout.seat_map_error")} message={seats.error ?? t("errors.unknown")} onRetry={seats.reload} />;
  }
  if (seats.data.length === 0) return <EmptyState message={t("checkout.seats_not_set_up")} />;

  const all = seats.data;
  const chosen = all.filter((seat) => selected.has(seat.id));

  const priceText = (seat: EventSeat) => {
    const type = typeOf(seat);
    return type ? `${type.name}, ${priceLabel(type.price_minor)}` : t("checkout.not_on_sale");
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

  const reserveLabel = busy ? t("checkout.reserving") : chosen.length > 0 ? t("checkout.reserve_count", { items: quantityLabel("seat", chosen.length) }) : t("checkout.reserve_seats");

  return (
    <View style={checkoutStyles.stack}>
      <SeatLegend />
      <SeatMap sections={sections} selected={selected} priceText={priceText} canSelect={canSelect} onToggle={toggle} />
      <View accessibilityLiveRegion="polite" style={styles.selection}>
        {chosen.length === 0 ? (
          <Text style={checkoutStyles.intro}>{t("checkout.seat_map_hint")}</Text>
        ) : (
          <ChosenSeats seats={chosen} typeOf={typeOf} onRemove={toggle} />
        )}
      </View>
      {promoSlot}
      <FormMessage message={message} />
      <View style={checkoutStyles.actions}>
        <PrimaryButton label={reserveLabel} disabled={busy || chosen.length === 0} onPress={() => onReserve(seatHoldLines(all, selected))} />
        <SubtleButton label={t("checkout.refresh_seats")} disabled={busy || seats.loading} onPress={refresh} />
        <Text style={checkoutStyles.intro}>{t("checkout.seat_hold_hint")}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  selection: { gap: 8 },
});
