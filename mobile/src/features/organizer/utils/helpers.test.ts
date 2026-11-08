import type { Attendee } from "@/api/types";
import type { PaidSalesChecklist } from "@/api/types/paidSales";
import type { SeatAvailability } from "@/api/types/seating";
import { countByTicketType } from "./attendees";
import { pageInfo } from "./paging";
import { activationTone, canStartActivation, paymentOpen } from "./paidSales";
import { countByStatus, priceCategories, seatEditable, seatPosition } from "./seating";

describe("pageInfo", () => {
  it("describes the visible range and neighbours", () => {
    expect(pageInfo(120, 50, 50, 50)).toMatchObject({ from: 51, to: 100, hasPrevious: true, hasNext: true, previousOffset: 0, nextOffset: 100 });
    expect(pageInfo(0, 50, 0, 0)).toMatchObject({ from: 0, to: 0, hasPrevious: false, hasNext: false });
  });
});

describe("paid sales", () => {
  const checklist = (overrides: Partial<PaidSalesChecklist>) =>
    ({ status: "incomplete", missing: ["activation_fee"], payment: null, ...overrides }) as PaidSalesChecklist;

  it("allows the fee only as the last step with no open payment", () => {
    expect(canStartActivation(checklist({}))).toBe(true);
    expect(canStartActivation(checklist({ missing: ["terms", "activation_fee"] }))).toBe(false);
    expect(canStartActivation(checklist({ status: "active", missing: [] }))).toBe(false);
    const pending = checklist({ status: "pending", payment: { id: "p", status: "pending", charged_minor: 0, environment: "simulation", provider_payment_id: null, simulated: true } });
    expect(paymentOpen(pending)).toBe(true);
    expect(canStartActivation(pending)).toBe(false);
    expect(canStartActivation(checklist({ status: "failed" }))).toBe(true);
  });

  it("maps states to tones", () => {
    expect(activationTone("active")).toBe("positive");
    expect(activationTone("suspended")).toBe("blocked");
    expect(activationTone("incomplete")).toBe("neutral");
  });
});

describe("seating", () => {
  it("lists categories, positions seats and counts statuses", () => {
    expect(priceCategories([{ price_category: "standard" }, { price_category: "premium" }, { price_category: "standard" }] as never)).toEqual(["premium", "standard"]);
    expect(seatPosition({ x: 400, y: 100 }, { width: 800, height: 400 })).toEqual({ left: "50%", top: "25%" });
    expect(seatPosition({ x: 900, y: -5 }, { width: 800, height: 400 })).toEqual({ left: "100%", top: "0%" });
    const seats = [{ status: "available" }, { status: "sold" }, { status: "available" }] as SeatAvailability[];
    expect(countByStatus(seats)).toMatchObject({ available: 2, sold: 1, blocked: 0 });
    expect(seatEditable({ status: "held" } as SeatAvailability)).toBe(false);
    expect(seatEditable({ status: "blocked" } as SeatAvailability)).toBe(true);
  });
});

describe("countByTicketType", () => {
  it("counts issued, checked-in and cancelled tickets per type", () => {
    const rows = [
      { ticket_type_id: "a", ticket_type_name: "GA", status: "valid" },
      { ticket_type_id: "a", ticket_type_name: "GA", status: "checked_in" },
      { ticket_type_id: "b", ticket_type_name: "VIP", status: "refunded" },
    ] as Attendee[];
    expect(countByTicketType(rows)).toEqual([
      { ticketTypeId: "a", name: "GA", issued: 2, checkedIn: 1, cancelled: 0 },
      { ticketTypeId: "b", name: "VIP", issued: 1, checkedIn: 0, cancelled: 1 },
    ]);
  });
});
