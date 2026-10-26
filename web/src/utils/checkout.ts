import type { Allocation, EventView, HoldLine, RecipientInput, TicketType } from "../api/types";
import { dateLabel } from "./format";

export type Quantities = Record<string, number>;
export type RecipientValues = Record<string, { name: string; email: string }>;

export interface Availability {
  purchasable: boolean;
  reason: string | null;
  maxQuantity: number;
}

// Mirrors the server's checks so the form only offers what can be reserved.
// The server remains authoritative; this just avoids obvious rejections.
export function ticketAvailability(type: TicketType, event: EventView, now: Date = new Date()): Availability {
  if (event.publication_state !== "published") {
    return { purchasable: false, reason: "Registration opens when the event is published", maxQuantity: 0 };
  }
  if (type.kind === "paid" || type.price_minor > 0) {
    return { purchasable: false, reason: "Paid checkout is not available yet", maxQuantity: 0 };
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
  return { purchasable: true, reason: null, maxQuantity: Math.max(1, Math.min(type.per_order_limit, type.quantity_limit)) };
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
