import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../api/errors";
import type { Attendee } from "../../../api/types";
import type { PaidSalesChecklist } from "../../../api/types/paidSales";
import type { PhysicalSeat, SeatAvailability } from "../../../api/types/seating";
import { countByTicketType } from "./attendees";
import { IDLE, text } from "./formState";
import { pageInfo } from "./paging";
import { activationTone, canStartActivation, paymentOpen } from "./paidSales";
import { orPlanned } from "./planned";
import { countByStatus, priceCategories, seatEditable, seatName, seatPosition } from "./seating";

function availability(status: SeatAvailability["status"]): SeatAvailability {
  return {
    id: `s-${status}`,
    created_at: "2026-10-01T00:00:00Z",
    event_id: "e1",
    layout_id: "l1",
    venue_seat_id: "vs",
    ticket_type_id: "t1",
    section_label: "A",
    row_label: "1",
    seat_label: "1",
    is_blocked: status === "blocked",
    x: 0,
    y: 0,
    is_accessible: false,
    status,
    paid_activation_required: false,
  };
}

describe("pageInfo edge cases", () => {
  it("handles the first page", () => {
    expect(pageInfo(120, 50, 0, 50)).toEqual({ from: 1, to: 50, total: 120, hasPrevious: false, hasNext: true, previousOffset: 0, nextOffset: 50 });
  });

  it("handles a short last page", () => {
    expect(pageInfo(120, 50, 100, 20)).toMatchObject({ from: 101, to: 120, hasPrevious: true, hasNext: false, previousOffset: 50 });
  });

  it("never computes a negative previous offset for an unaligned offset", () => {
    expect(pageInfo(120, 50, 30, 50).previousOffset).toBe(0);
  });

  it("keeps normal pages unchanged", () => {
    expect(pageInfo(230, 50, 50, 50)).toEqual({ from: 51, to: 100, total: 230, hasPrevious: true, hasNext: true, previousOffset: 0, nextOffset: 100 });
    expect(pageInfo(230, 50, 100, 50)).toEqual({ from: 101, to: 150, total: 230, hasPrevious: true, hasNext: true, previousOffset: 50, nextOffset: 150 });
    expect(pageInfo(230, 50, 200, 30)).toEqual({ from: 201, to: 230, total: 230, hasPrevious: true, hasNext: false, previousOffset: 150, nextOffset: 250 });
  });

  it("reports an empty page past the end as 0–0 and goes back to the last page with rows", () => {
    // Rows were removed while paging: total 10, but the viewer is on offset 50.
    expect(pageInfo(10, 50, 50, 0)).toEqual({ from: 0, to: 0, total: 10, hasPrevious: true, hasNext: false, previousOffset: 0, nextOffset: 100 });
  });

  it("never offers Next from an empty page, even when the server's total says more rows exist", () => {
    // Total and rows disagree (offset < total, yet nothing came back).
    expect(pageInfo(120, 50, 50, 0)).toMatchObject({ from: 0, to: 0, hasPrevious: true, hasNext: false, previousOffset: 0 });
    expect(pageInfo(10, 50, 0, 0)).toMatchObject({ from: 0, to: 0, hasPrevious: false, hasNext: false });
  });

  it("clamps Previous to the last page that still has rows", () => {
    expect(pageInfo(10, 50, 200, 0).previousOffset).toBe(0);
    expect(pageInfo(230, 50, 400, 0)).toEqual({ from: 0, to: 0, total: 230, hasPrevious: true, hasNext: false, previousOffset: 200, nextOffset: 450 });
    // Exactly at a page boundary: rows 1–100 remain, so the last page is offset 50.
    expect(pageInfo(100, 50, 150, 0).previousOffset).toBe(50);
    expect(pageInfo(101, 50, 150, 0).previousOffset).toBe(100);
  });

  it("keeps from and to at 0 for an empty result set", () => {
    expect(pageInfo(0, 50, 0, 0)).toEqual({ from: 0, to: 0, total: 0, hasPrevious: false, hasNext: false, previousOffset: 0, nextOffset: 50 });
    expect(pageInfo(0, 50, 100, 0)).toMatchObject({ from: 0, to: 0, hasPrevious: true, previousOffset: 0 });
  });

  it("treats an exactly full single page as having no next page", () => {
    expect(pageInfo(50, 50, 0, 50).hasNext).toBe(false);
  });
});

describe("paid sales edge cases", () => {
  const checklist = (overrides: Partial<PaidSalesChecklist>) =>
    ({ status: "incomplete", missing: ["activation_fee"], payment: null, ...overrides }) as PaidSalesChecklist;
  const payment = (status: string) => ({ id: "p", status, charged_minor: 0, environment: "simulation", provider_payment_id: null, simulated: true });

  it("never lets a suspended event pay the fee", () => {
    expect(canStartActivation(checklist({ status: "suspended", missing: [] }))).toBe(false);
    expect(canStartActivation(checklist({ status: "suspended", missing: ["activation_fee"] }))).toBe(false);
  });

  it("allows paying when nothing is missing and the event is not active (e.g. a failed attempt)", () => {
    expect(canStartActivation(checklist({ status: "failed", missing: [] }))).toBe(true);
  });

  it("only counts a created or pending attempt on a pending checklist as open", () => {
    expect(paymentOpen(checklist({ status: "pending", payment: payment("created") }))).toBe(true);
    expect(paymentOpen(checklist({ status: "pending", payment: payment("failed") }))).toBe(false);
    expect(paymentOpen(checklist({ status: "pending", payment: null }))).toBe(false);
    expect(paymentOpen(checklist({ status: "incomplete", payment: payment("pending") }))).toBe(false);
  });

  it("allows a retry after a failed attempt on a pending checklist", () => {
    expect(canStartActivation(checklist({ status: "pending", payment: payment("failed") }))).toBe(true);
  });

  it("tones every activation state", () => {
    expect(activationTone("active")).toBe("positive");
    expect(activationTone("pending")).toBe("pending");
    expect(activationTone("failed")).toBe("blocked");
    expect(activationTone("suspended")).toBe("blocked");
    expect(activationTone("incomplete")).toBe("neutral");
    expect(activationTone("unknown")).toBe("neutral");
  });
});

describe("seating edge cases", () => {
  it("dedupes and sorts price categories, and handles an empty layout", () => {
    const seat = (price_category: string) => ({ price_category }) as PhysicalSeat;
    expect(priceCategories([seat("B"), seat("A"), seat("B")])).toEqual(["A", "B"]);
    expect(priceCategories([])).toEqual([]);
  });

  it("clamps seats outside the canvas and survives a zero-size canvas", () => {
    expect(seatPosition({ x: -10, y: 500 }, { width: 100, height: 100 })).toEqual({ left: "0%", top: "100%" });
    expect(seatPosition({ x: 50, y: 25 }, { width: 100, height: 50 })).toEqual({ left: "50%", top: "50%" });
    const zero = seatPosition({ x: 0, y: 0 }, { width: 0, height: -5 });
    expect(zero).toEqual({ left: "0%", top: "0%" });
  });

  it("counts every status, including zeros", () => {
    expect(countByStatus([])).toEqual({ available: 0, unavailable: 0, blocked: 0, held: 0, sold: 0, refund_pending: 0 });
    expect(countByStatus([availability("refund_pending"), availability("held"), availability("held")])).toMatchObject({ held: 2, refund_pending: 1, sold: 0 });
  });

  it("locks seats with a live allocation", () => {
    expect(seatEditable(availability("available"))).toBe(true);
    expect(seatEditable(availability("blocked"))).toBe(true);
    expect(seatEditable(availability("unavailable"))).toBe(true);
    expect(seatEditable(availability("held"))).toBe(false);
    expect(seatEditable(availability("sold"))).toBe(false);
    expect(seatEditable(availability("refund_pending"))).toBe(false);
  });

  it("names a seat", () => {
    expect(seatName({ section_label: "Balcony", row_label: "C", seat_label: "12" })).toBe("Balcony · Row C · Seat 12");
  });
});

describe("countByTicketType edge cases", () => {
  const row = (ticket_type_id: string, status: string): Attendee =>
    ({ ticket_type_id, ticket_type_name: ticket_type_id.toUpperCase(), status }) as Attendee;

  it("keeps first-seen order and counts refund_pending as cancelled", () => {
    const counts = countByTicketType([row("vip", "valid"), row("ga", "refund_pending"), row("vip", "checked_in"), row("ga", "refunded")]);
    expect(counts).toEqual([
      { ticketTypeId: "vip", name: "VIP", issued: 2, checkedIn: 1, cancelled: 0 },
      { ticketTypeId: "ga", name: "GA", issued: 2, checkedIn: 0, cancelled: 2 },
    ]);
  });

  it("returns nothing for no attendees", () => {
    expect(countByTicketType([])).toEqual([]);
  });
});

describe("orPlanned", () => {
  it("passes a value through", async () => {
    await expect(orPlanned(async () => 42)).resolves.toEqual({ planned: false, value: 42 });
  });

  it("marks an endpoint the backend does not serve yet", async () => {
    await expect(orPlanned(() => Promise.reject(new ApiError("x", 404)))).resolves.toEqual({ planned: true, value: null });
    await expect(orPlanned(() => Promise.reject(new ApiError("x", 501)))).resolves.toEqual({ planned: true, value: null });
  });

  it("re-throws real failures, including a coded 404", async () => {
    const notFound = new ApiError("Gone", 404, "event_not_found");
    await expect(orPlanned(() => Promise.reject(notFound))).rejects.toBe(notFound);
    const denied = new ApiError("No", 403, "permission_denied");
    await expect(orPlanned(() => Promise.reject(denied))).rejects.toBe(denied);
    const load = vi.fn(() => Promise.reject(new TypeError("bug")));
    await expect(orPlanned(load)).rejects.toThrow("bug");
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe("form state", () => {
  it("starts idle", () => {
    expect(IDLE).toEqual({ message: "", success: false, busy: false });
  });

  it("reads trimmed text and treats missing fields as empty", () => {
    const data = new FormData();
    data.set("name", "  Main hall  ");
    expect(text(data, "name")).toBe("Main hall");
    expect(text(data, "missing")).toBe("");
  });
});
