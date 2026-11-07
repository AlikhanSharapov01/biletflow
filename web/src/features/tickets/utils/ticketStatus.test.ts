import { describe, expect, it } from "vitest";
import type { TicketAdmission } from "../../../api/types/checkout";
import { admissionSummary, deliveryLook } from "./ticketStatus";

const window = { opens_at: "2026-11-01T17:00:00Z", closes_at: "2026-11-01T21:00:00Z" };
const admission = (overrides: Partial<TicketAdmission>): TicketAdmission => ({
  ticket_id: "t1",
  status: "valid",
  checked_in_at: null,
  reversed_at: null,
  admission_window: window,
  ...overrides,
});

describe("admissionSummary", () => {
  const during = new Date("2026-11-01T18:00:00Z");

  it("describes check-in, reversal, refunds and the door window", () => {
    expect(admissionSummary(admission({ status: "checked_in", checked_in_at: "2026-11-01T18:01:00Z" }), during).label).toBe("Checked in");
    expect(admissionSummary(admission({ reversed_at: "2026-11-01T18:05:00Z" }), during).label).toBe("Admission reversed");
    expect(admissionSummary(admission({ status: "refunded" }), during).tone).toBe("blocked");
    expect(admissionSummary(admission({}), new Date("2026-11-01T10:00:00Z")).label).toBe("Doors not open");
    expect(admissionSummary(admission({}), during).label).toBe("Doors open");
  });
});

describe("deliveryLook", () => {
  it("maps delivery states to tones", () => {
    expect(deliveryLook("delivered").tone).toBe("positive");
    expect(deliveryLook("failed").tone).toBe("blocked");
    expect(deliveryLook("weird_state").label).toBe("weird state");
  });
});
