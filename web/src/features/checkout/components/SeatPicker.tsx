import { quantityLabel, t, useLocale } from "../../../i18n";
import { useMemo, useState, type ReactNode } from "react";
import { listSeats } from "../../../api/checkout";
import type { EventSeat, HoldLine } from "../../../api/types/checkout";
import type { EventView, TicketType } from "../../../api/types";
import { Button, EmptyState, ErrorPanel, FormMessage, Loading } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { priceLabel } from "../../../utils/format";
import { groupSeats, seatHoldLines, selectedOfType } from "../utils/seats";
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
  useLocale();
  const seats = useRequest(() => listSeats(event.id), [event.id]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const sections = useMemo(() => groupSeats(seats.data ?? []), [seats.data]);
  const typeOf = (seat: EventSeat) => tickets.find((type) => type.id === seat.ticket_type_id);

  if (seats.loading && !seats.data) return <Loading label={t("checkout.seat_map_loading")} />;
  if (seats.error || !seats.data) {
    return <ErrorPanel title={t("checkout.seat_map_error")} message={seats.error ?? t("errors.unknown")} onRetry={seats.reload} />;
  }
  if (seats.data.length === 0) return <EmptyState>{t("checkout.seats_not_set_up")}</EmptyState>;

  const all = seats.data;
  const chosen = all.filter((seat) => selected.has(seat.id));
  const total = chosen.reduce((sum, seat) => sum + (typeOf(seat)?.price_minor ?? 0), 0);

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

  return (
    <div className="checkout">
      <SeatLegend />
      <SeatMap sections={sections} selected={selected} priceText={priceText} canSelect={canSelect} onToggle={toggle} />
      <div className="seat-selection" aria-live="polite">
        {chosen.length === 0 ? (
          <p className="form-intro">{t("checkout.seat_map_hint")}</p>
        ) : (
          <ul className="seat-chosen">
            {chosen.map((seat) => (
              <li key={seat.id}>
                <span>
                  {t("format.section_row_seat", { section: seat.section_label, row: seat.row_label, seat: seat.seat_label })}
                  <small> {typeOf(seat)?.name}</small>
                </span>
                <span className="price">{priceLabel(typeOf(seat)?.price_minor ?? 0)}</span>
                <Button variant="text" size="sm" aria-label={t("checkout.remove_seat", { p0: seat.seat_label, p1: seat.row_label })} onClick={() => toggle(seat)}>{t("common.remove")}</Button>
              </li>
            ))}
            <li className="seat-chosen-total">
              <span>{t("checkout.ticket_subtotal")}</span>
              <span className="price">{priceLabel(total)}</span>
            </li>
          </ul>
        )}
      </div>
      {promoSlot}
      <FormMessage message={message} />
      <div className="form-actions">
        <Button variant="primary" disabled={busy || chosen.length === 0} onClick={() => onReserve(seatHoldLines(all, selected))}>
          {busy ? t("checkout.reserving") : chosen.length > 0 ? t("checkout.reserve_count", { items: quantityLabel("seat", chosen.length) }) : t("checkout.reserve_seats")}
        </Button>
        <Button disabled={busy || seats.loading} onClick={refresh}>{t("checkout.refresh_seats")}</Button>
        <small className="form-intro">{t("checkout.seat_hold_hint")}</small>
      </div>
    </div>
  );
}
