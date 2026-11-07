import type { EventSeat, HoldLine, SeatStatus } from "../../../api/types/checkout";

export interface SeatRow {
  label: string;
  seats: EventSeat[];
}

export interface SeatSection {
  label: string;
  rows: SeatRow[];
}

const collator = new Intl.Collator(undefined, { numeric: true });

// Sections, then rows, then seats in layout order (x, then label).
export function groupSeats(seats: EventSeat[]): SeatSection[] {
  const sections = new Map<string, Map<string, EventSeat[]>>();
  for (const seat of seats) {
    const rows = sections.get(seat.section_label) ?? new Map<string, EventSeat[]>();
    rows.set(seat.row_label, [...(rows.get(seat.row_label) ?? []), seat]);
    sections.set(seat.section_label, rows);
  }
  return [...sections.entries()]
    .sort(([a], [b]) => collator.compare(a, b))
    .map(([label, rows]) => ({
      label,
      rows: [...rows.entries()]
        .sort(([a], [b]) => collator.compare(a, b))
        .map(([rowLabel, rowSeats]) => ({
          label: rowLabel,
          seats: [...rowSeats].sort((a, b) => a.x - b.x || collator.compare(a.seat_label, b.seat_label)),
        })),
    }));
}

export type SeatLook = SeatStatus | "selected";

export const SEAT_LOOKS: Record<SeatLook, { label: string; glyph: string }> = {
  available: { label: "Available", glyph: "" },
  selected: { label: "Selected", glyph: "✓" },
  held: { label: "Held by another buyer", glyph: "◔" },
  sold: { label: "Sold", glyph: "×" },
  refund_pending: { label: "Sold (refund pending)", glyph: "×" },
  blocked: { label: "Not for sale", glyph: "–" },
  unavailable: { label: "Unavailable", glyph: "–" },
};

export function seatLook(seat: EventSeat, selected: ReadonlySet<string>): SeatLook {
  return selected.has(seat.id) ? "selected" : seat.status;
}

// One hold line per ticket type, carrying that type's chosen seats.
export function seatHoldLines(seats: EventSeat[], selected: ReadonlySet<string>): HoldLine[] {
  const byType = new Map<string, string[]>();
  for (const seat of seats) {
    if (!selected.has(seat.id)) continue;
    byType.set(seat.ticket_type_id, [...(byType.get(seat.ticket_type_id) ?? []), seat.id]);
  }
  return [...byType.entries()].map(([ticket_type_id, seat_ids]) => ({ ticket_type_id, quantity: seat_ids.length, seat_ids }));
}

// How many seats of the same ticket type are already chosen.
export function selectedOfType(seats: EventSeat[], selected: ReadonlySet<string>, ticketTypeId: string): number {
  return seats.filter((seat) => seat.ticket_type_id === ticketTypeId && selected.has(seat.id)).length;
}
