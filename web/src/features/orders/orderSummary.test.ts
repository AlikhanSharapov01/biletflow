import { describe, expect, it } from "vitest";
import type { IssuedTicket } from "../../api/types";
import { makeOrder, makeOrderItem } from "../../../tests/helpers/fixtures";
import { orderStart, orderTitle } from "./orderSummary";

function ticket(overrides: Partial<IssuedTicket> = {}): IssuedTicket {
  return {
    id: "tk1",
    order_item_id: "i1",
    event_id: "e1",
    event_title: "Jazz night",
    event_starts_at: "2026-11-01T18:00:00Z",
    venue_name: "Hall",
    ticket_type_name: "General",
    recipient_name: "Aida",
    seat_snapshot: null,
    status: "valid",
    recipient_user_id: "u1",
    claimed_at: null,
    issued_at: "2026-10-26T12:00:00Z",
    qr_payload: null,
    ...overrides,
  };
}

describe("order summary", () => {
  it("takes the event from the first issued ticket", () => {
    const order = makeOrder({
      items: [makeOrderItem({ ticket: ticket() }), makeOrderItem({ id: "i2", ticket: ticket({ event_title: "Other" }) })],
    });
    expect(orderTitle(order)).toBe("Jazz night");
    expect(orderStart(order)).toBe("2026-11-01T18:00:00Z");
  });

  it("falls back when the order has no items", () => {
    const order = makeOrder({ items: [] });
    expect(orderTitle(order)).toBe("Event");
    expect(orderStart(order)).toBeNull();
  });

  it("falls back when the first item has no ticket yet (pending order)", () => {
    const order = makeOrder({ status: "pending", items: [makeOrderItem({ ticket: null })] });
    expect(orderTitle(order)).toBe("Event");
    expect(orderStart(order)).toBeNull();
  });
});
