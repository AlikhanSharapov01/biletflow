import { request } from "./client";
import type { EventSeat, Hold, HoldLine, Order, RecipientInput, SeatPage } from "./types/checkout";

const id = encodeURIComponent;
const SEAT_PAGE = 500;

// Reserves inventory for ten minutes. A new hold on the same event replaces
// the buyer's earlier active hold. `promoCode` is only sent once the planned
// promo preview endpoint has accepted it.
export function createHold(eventId: string, items: HoldLine[], promoCode?: string): Promise<Hold> {
  const body = promoCode ? { items, promo_code: promoCode } : { items };
  return request<Hold>(`/api/v1/events/${id(eventId)}/holds`, { method: "POST", body });
}

export function getHold(holdId: string): Promise<Hold> {
  return request<Hold>(`/api/v1/holds/${id(holdId)}`);
}

export function releaseHold(holdId: string): Promise<unknown> {
  return request(`/api/v1/holds/${id(holdId)}`, { method: "DELETE" });
}

// Free baskets only: one recipient per allocation; issues the tickets and the
// delivery emails. A paid basket returns 409 payment_required.
export function confirmHold(holdId: string, recipients: RecipientInput[]): Promise<Order> {
  return request<Order>(`/api/v1/holds/${id(holdId)}/confirm`, { method: "POST", body: { recipients } });
}

// Paid baskets: saves the quote on a pending order and opens a simulated
// payment attempt. A basket without paid types is confirmed immediately.
export function startCheckout(holdId: string, recipients: RecipientInput[]): Promise<Order> {
  return request<Order>(`/api/v1/holds/${id(holdId)}/checkout`, { method: "POST", body: { recipients } });
}

// Every seat of an assigned-seating event with its live status, page by page.
export async function listSeats(eventId: string): Promise<EventSeat[]> {
  const seats: EventSeat[] = [];
  for (let offset = 0; ; offset += SEAT_PAGE) {
    const page = await request<SeatPage>(`/api/v1/events/${id(eventId)}/seats`, { query: { limit: SEAT_PAGE, offset } });
    seats.push(...page.items);
    if (page.items.length < SEAT_PAGE || offset >= 10_000) return seats;
  }
}
