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
  const seats = useRequest(() => listSeats(event.id), [event.id]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const sections = useMemo(() => groupSeats(seats.data ?? []), [seats.data]);
  const typeOf = (seat: EventSeat) => tickets.find((type) => type.id === seat.ticket_type_id);

  if (seats.loading && !seats.data) return <Loading label="Loading the seat map…" />;
  if (seats.error || !seats.data) {
    return <ErrorPanel title="We couldn’t load the seat map." message={seats.error ?? "Unknown error"} onRetry={seats.reload} />;
  }
  if (seats.data.length === 0) return <EmptyState>The organizer has not set up seats for this event yet.</EmptyState>;

  const all = seats.data;
  const chosen = all.filter((seat) => selected.has(seat.id));
  const total = chosen.reduce((sum, seat) => sum + (typeOf(seat)?.price_minor ?? 0), 0);

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

  return (
    <div className="checkout">
      <SeatLegend />
      <SeatMap sections={sections} selected={selected} priceText={priceText} canSelect={canSelect} onToggle={toggle} />
      <div className="seat-selection" aria-live="polite">
        {chosen.length === 0 ? (
          <p className="form-intro">Choose seats on the map. Each ticket type has its own per-order limit.</p>
        ) : (
          <ul className="seat-chosen">
            {chosen.map((seat) => (
              <li key={seat.id}>
                <span>
                  Section {seat.section_label} · Row {seat.row_label} · Seat {seat.seat_label}
                  <small> {typeOf(seat)?.name}</small>
                </span>
                <span className="price">{priceLabel(typeOf(seat)?.price_minor ?? 0)}</span>
                <Button variant="text" size="sm" aria-label={`Remove seat ${seat.seat_label} in row ${seat.row_label}`} onClick={() => toggle(seat)}>
                  Remove
                </Button>
              </li>
            ))}
            <li className="seat-chosen-total">
              <span>Ticket subtotal</span>
              <span className="price">{priceLabel(total)}</span>
            </li>
          </ul>
        )}
      </div>
      {promoSlot}
      <FormMessage message={message} />
      <div className="form-actions">
        <Button variant="primary" disabled={busy || chosen.length === 0} onClick={() => onReserve(seatHoldLines(all, selected))}>
          {busy ? "Reserving…" : chosen.length > 0 ? `Reserve ${chosen.length} seat${chosen.length === 1 ? "" : "s"}` : "Reserve seats"}
        </Button>
        <Button disabled={busy || seats.loading} onClick={refresh}>
          Refresh seats
        </Button>
        <small className="form-intro">Seats are held for 10 minutes while you add recipients.</small>
      </div>
    </div>
  );
}
