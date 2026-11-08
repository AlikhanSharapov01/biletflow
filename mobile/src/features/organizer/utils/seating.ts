import type { PhysicalSeat, SeatAvailability, SeatStatus } from "@/api/types/seating";

// Distinct price categories of a layout, in a stable order.
export function priceCategories(seats: PhysicalSeat[]): string[] {
  return [...new Set(seats.map((seat) => seat.price_category))].sort();
}

// Places a seat inside the layout canvas as percentages, so the grid scales
// with the panel width.
export function seatPosition(seat: { x: number; y: number }, canvas: { width: number; height: number }): { left: `${number}%`; top: `${number}%` } {
  const clamp = (value: number) => Math.min(100, Math.max(0, value));
  const width = canvas.width > 0 ? canvas.width : 1;
  const height = canvas.height > 0 ? canvas.height : 1;
  return { left: `${clamp((seat.x / width) * 100)}%`, top: `${clamp((seat.y / height) * 100)}%` };
}

export function countByStatus(seats: SeatAvailability[]): Record<SeatStatus, number> {
  const counts: Record<SeatStatus, number> = { available: 0, unavailable: 0, blocked: 0, held: 0, sold: 0, refund_pending: 0 };
  for (const seat of seats) counts[seat.status] += 1;
  return counts;
}

// Seats with a live allocation can be neither blocked nor repointed.
export function seatEditable(seat: SeatAvailability): boolean {
  return seat.status !== "held" && seat.status !== "sold" && seat.status !== "refund_pending";
}

export function seatName(seat: { section_label: string; row_label: string; seat_label: string }): string {
  return `${seat.section_label} · Row ${seat.row_label} · Seat ${seat.seat_label}`;
}
