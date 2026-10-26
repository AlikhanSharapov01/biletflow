import { describe, expect, it } from "vitest";
import type { EventView } from "../api/types";
import { eventFormValues, ticketTypeFormValues, toEventInput, toTicketTypeInput } from "./eventForm";

const NOW = new Date("2026-10-26T12:00:00Z");

function values(overrides: Partial<ReturnType<typeof eventFormValues>>) {
  return {
    ...eventFormValues(),
    title: "Launch night",
    category_id: "c1",
    venue_id: "v1",
    starts_at: "2026-11-05T19:00",
    ends_at: "2026-11-05T22:00",
    time_zone: "Asia/Almaty",
    ...overrides,
  };
}

describe("toEventInput", () => {
  it("derives blank windows from the event times", () => {
    const result = toEventInput(values({}), undefined, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.registration_opens_at).toBe(NOW.toISOString());
    expect(result.input.registration_closes_at).toBe(result.input.starts_at);
    expect(result.input.admission_opens_at).toBe(result.input.starts_at);
    expect(result.input.admission_closes_at).toBe(result.input.ends_at);
    expect(result.input.seating_mode).toBe("general");
    expect(result.input.capacity).toBe(50);
    expect(result.input.refund_cutoff_at).toBeNull();
  });

  it("rejects an end before the start and a past start for new events", () => {
    expect(toEventInput(values({ ends_at: "2026-11-05T18:00" }), undefined, NOW)).toMatchObject({ ok: false });
    expect(toEventInput(values({ starts_at: "2026-10-01T19:00", ends_at: "2026-10-01T20:00" }), undefined, NOW)).toMatchObject({ ok: false });
  });

  it("requires a refund cutoff when refunds are allowed and keeps it before the start", () => {
    expect(toEventInput(values({ refund_allowed: true }), undefined, NOW)).toMatchObject({ ok: false });
    const result = toEventInput(values({ refund_allowed: true, refund_cutoff_at: "2026-11-04T12:00" }), undefined, NOW);
    expect(result.ok).toBe(true);
  });

  it("preserves seating mode and layout when editing", () => {
    const existing = { seating_mode: "assigned", venue_layout_id: "layout-1" } as EventView;
    const result = toEventInput(values({}), existing, NOW);
    expect(result).toMatchObject({ ok: true, input: { seating_mode: "assigned", venue_layout_id: "layout-1" } });
  });
});

describe("toTicketTypeInput", () => {
  const event = {
    capacity: 100,
    registration_opens_at: "2026-10-01T00:00:00Z",
    registration_closes_at: "2026-11-05T19:00:00Z",
  } as EventView;

  it("defaults sales windows to the registration window and converts tenge", () => {
    const result = toTicketTypeInput({ ...ticketTypeFormValues(), name: "VIP", kind: "paid", price: "8500", quantity_limit: "10" }, event);
    expect(result).toMatchObject({
      ok: true,
      input: { price_minor: 850000, sales_open_at: event.registration_opens_at, sales_close_at: event.registration_closes_at, per_order_limit: 5 },
    });
  });

  it("forces free tickets to zero and limits quantity to the capacity", () => {
    const free = toTicketTypeInput({ ...ticketTypeFormValues(), name: "Free", price: "99", quantity_limit: "100" }, event);
    expect(free).toMatchObject({ ok: true, input: { price_minor: 0, kind: "free" } });
    expect(toTicketTypeInput({ ...ticketTypeFormValues(), name: "Too many", quantity_limit: "101" }, event)).toMatchObject({ ok: false });
    expect(toTicketTypeInput({ ...ticketTypeFormValues(), name: "Paid zero", kind: "paid", price: "0", quantity_limit: "1" }, event)).toMatchObject({ ok: false });
  });
});
