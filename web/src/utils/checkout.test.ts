import { describe, expect, it } from "vitest";
import type { Allocation, EventView, TicketType } from "../api/types";
import { holdLines, initialRecipients, recipientsComplete, recipientsPayload, ticketAvailability, totalQuantity } from "./checkout";

const NOW = new Date("2026-10-26T12:00:00Z");

const event: EventView = {
  id: "e1",
  created_at: "2026-10-01T00:00:00Z",
  organization_id: "o1",
  publication_state: "published",
  moderation_state: "normal",
  calendar_uid: "uid",
  calendar_sequence: 0,
  availability_version: 1,
  updated_at: "2026-10-01T00:00:00Z",
  time_status: "upcoming",
  category_id: "c1",
  venue_id: "v1",
  title: "Demo",
  description: "",
  visibility: "public",
  seating_mode: "general",
  capacity: 50,
  starts_at: "2026-11-01T18:00:00Z",
  ends_at: "2026-11-01T21:00:00Z",
  time_zone: "Asia/Almaty",
  registration_opens_at: "2026-10-01T00:00:00Z",
  registration_closes_at: "2026-11-01T18:00:00Z",
  admission_opens_at: "2026-11-01T18:00:00Z",
  admission_closes_at: "2026-11-01T21:00:00Z",
  refund_allowed: false,
  refund_cutoff_at: null,
};

function type(overrides: Partial<TicketType>): TicketType {
  return {
    id: "t1",
    created_at: "2026-10-01T00:00:00Z",
    event_id: "e1",
    name: "General",
    description: "",
    kind: "free",
    price_minor: 0,
    quantity_limit: 20,
    per_order_limit: 5,
    sales_open_at: "2026-10-01T00:00:00Z",
    sales_close_at: "2026-11-01T18:00:00Z",
    is_hidden: false,
    ...overrides,
  };
}

describe("ticketAvailability", () => {
  it("offers free tickets inside the sales window up to the per-order limit", () => {
    expect(ticketAvailability(type({}), event, NOW)).toEqual({ purchasable: true, reason: null, maxQuantity: 5 });
  });

  it("caps the quantity at the remaining inventory", () => {
    expect(ticketAvailability(type({ quantity_limit: 2 }), event, NOW).maxQuantity).toBe(2);
  });

  it("blocks paid types, closed windows and unpublished events", () => {
    expect(ticketAvailability(type({ kind: "paid", price_minor: 500000 }), event, NOW).reason).toMatch(/Paid checkout/);
    expect(ticketAvailability(type({ sales_close_at: "2026-10-20T00:00:00Z" }), event, NOW).reason).toBe("Sales closed");
    expect(ticketAvailability(type({ sales_open_at: "2026-10-30T00:00:00Z" }), event, NOW).reason).toMatch(/^Sales open/);
    expect(ticketAvailability(type({}), { ...event, publication_state: "draft" }, NOW).purchasable).toBe(false);
  });
});

describe("hold lines", () => {
  it("keeps only positive quantities", () => {
    expect(holdLines({ a: 2, b: 0, c: 1 })).toEqual([
      { ticket_type_id: "a", quantity: 2 },
      { ticket_type_id: "c", quantity: 1 },
    ]);
    expect(totalQuantity({ a: 2, b: 0, c: 1 })).toBe(3);
  });
});

describe("recipients", () => {
  const allocations: Allocation[] = [
    { id: "al1", ticket_type_id: "t1", event_seat_id: null, state: "held" },
    { id: "al2", ticket_type_id: "t1", event_seat_id: null, state: "held" },
  ];

  it("gives the buyer the first place and leaves the rest blank", () => {
    const values = initialRecipients(allocations, { name: "Aida", email: "aida@example.com" });
    expect(values.al1).toEqual({ name: "Aida", email: "aida@example.com" });
    expect(values.al2).toEqual({ name: "", email: "" });
    expect(recipientsComplete(allocations, values)).toBe(false);
  });

  it("normalises emails in the payload and validates completeness", () => {
    const values = {
      al1: { name: " Aida ", email: " Aida@Example.com " },
      al2: { name: "Timur", email: "timur@example.com" },
    };
    expect(recipientsComplete(allocations, values)).toBe(true);
    expect(recipientsPayload(allocations, values)).toEqual([
      { allocation_id: "al1", name: "Aida", email: "aida@example.com" },
      { allocation_id: "al2", name: "Timur", email: "timur@example.com" },
    ]);
  });
});
