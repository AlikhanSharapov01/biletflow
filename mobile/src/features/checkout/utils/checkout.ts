import type { Allocation, EventView, HoldLine, RecipientInput, TicketType } from "@/api/types";
import { dateLabel } from "@/utils/format";

export const PAID_NOTE = "Paid checkout · demonstration payment, no real money moves";

export function isPaidType(type: TicketType): boolean {
  return type.kind === "paid" || type.price_minor > 0;
}

export type Quantities = Record<string, number>;
export type RecipientValues = Record<string, { name: string; email: string }>;

export interface Availability {
  purchasable: boolean;
  reason: string | null;
  maxQuantity: number;
}

// Mirrors the server's checks so the form only offers what can be reserved.
// The server remains authoritative; this just avoids obvious rejections.
// Paid types are offered too: only the server knows whether the event's paid
// sales are active, and it answers 409 paid_sales_inactive when they are not.
export function ticketAvailability(type: TicketType, event: EventView, now: Date = new Date()): Availability {
  if (event.publication_state !== "published") {
    return { purchasable: false, reason: "Registration opens when the event is published", maxQuantity: 0 };
  }
  if (type.quantity_limit <= 0) {
    return { purchasable: false, reason: "Not available", maxQuantity: 0 };
  }
  const opens = new Date(type.sales_open_at).getTime();
  const closes = new Date(type.sales_close_at).getTime();
  if (now.getTime() < opens) {
    return { purchasable: false, reason: `Sales open ${dateLabel(type.sales_open_at)}`, maxQuantity: 0 };
  }
  if (now.getTime() > closes) {
    return { purchasable: false, reason: "Sales closed", maxQuantity: 0 };
  }
  const maxQuantity = Math.max(1, Math.min(type.per_order_limit, type.quantity_limit));
  if (isPaidType(type)) {
    return { purchasable: true, reason: PAID_NOTE, maxQuantity };
  }
  return { purchasable: true, reason: null, maxQuantity };
}

export function holdLines(quantities: Quantities): HoldLine[] {
  return Object.entries(quantities)
    .filter(([, quantity]) => quantity > 0)
    .map(([ticket_type_id, quantity]) => ({ ticket_type_id, quantity }));
}

export function totalQuantity(quantities: Quantities): number {
  return Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0);
}

// Default recipients: the buyer takes the first place, the rest start empty.
export function initialRecipients(allocations: Allocation[], buyer: { name: string; email: string }): RecipientValues {
  const values: RecipientValues = {};
  allocations.forEach((allocation, index) => {
    values[allocation.id] = index === 0 ? { ...buyer } : { name: "", email: "" };
  });
  return values;
}

export function recipientsPayload(allocations: Allocation[], values: RecipientValues): RecipientInput[] {
  return allocations.map((allocation) => {
    const value = values[allocation.id] ?? { name: "", email: "" };
    return { allocation_id: allocation.id, name: value.name.trim(), email: value.email.trim().toLowerCase() };
  });
}

export function recipientsComplete(allocations: Allocation[], values: RecipientValues): boolean {
  return recipientsPayload(allocations, values).every((row) => row.name.length > 0 && /\S+@\S+\.\S+/.test(row.email));
}

// True when any held place belongs to a paid ticket type: such a basket goes
// through POST /holds/{id}/checkout instead of /confirm.
export function basketIsPaid(allocations: Allocation[], tickets: TicketType[]): boolean {
  return allocations.some((allocation) => {
    const type = tickets.find((item) => item.id === allocation.ticket_type_id);
    return type ? isPaidType(type) : false;
  });
}

// Face-value subtotal of a hold, for display before the server's quote.
export function holdSubtotal(allocations: Allocation[], tickets: TicketType[]): number {
  return allocations.reduce((sum, allocation) => sum + (tickets.find((item) => item.id === allocation.ticket_type_id)?.price_minor ?? 0), 0);
}
