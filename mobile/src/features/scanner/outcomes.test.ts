import { describeOutcome, isEntryCode, isEntryConfirmation } from "@/features/scanner/outcomes";

const ZONE = "Asia/Almaty";

describe("describeOutcome", () => {
  it("shows the guest and seat when admitted", () => {
    const view = describeOutcome(
      {
        kind: "admitted",
        result: "admitted",
        check_in_id: "c1",
        ticket_id: "t1",
        event_id: "e1",
        attendee_name: "Aru A.",
        ticket_type_name: "VIP",
        seat: { section_label: "A", row_label: "2", seat_label: "7" },
        checked_in_at: "2026-11-08T10:00:00Z",
        replayed: false,
      },
      ZONE
    );
    expect(view.tone).toBe("admitted");
    expect(view.lines).toEqual(["Aru A.", "VIP", "Section A · Row 2 · Seat 7"]);
  });

  it.each(["sign_in_required", "confirmation_expired", "confirmation_used", "invalid_confirmation"])(
    "asks for an entry confirmation on %s",
    (code) => {
      const view = describeOutcome({ kind: "rejected", code }, ZONE);
      expect(view.needsConfirmation).toBe(true);
      expect(view.tone).toBe("warning");
    }
  );

  it("never treats a campaign QR as a ticket", () => {
    const view = describeOutcome({ kind: "rejected", code: "not_a_ticket_qr" }, ZONE);
    expect(view.title).toBe("Not a ticket");
    expect(view.needsConfirmation).toBeUndefined();
  });

  it("explains refunded tickets", () => {
    const view = describeOutcome({ kind: "rejected", code: "ticket_not_valid", ticketStatus: "refunded" }, ZONE);
    expect(view.lines).toEqual(["This ticket was refunded."]);
  });

  it("offers a retry message when offline", () => {
    expect(describeOutcome({ kind: "network" }, ZONE).title).toBe("No connection");
  });
});

describe("entry confirmation inputs", () => {
  it("recognizes the confirmation QR prefix only", () => {
    expect(isEntryConfirmation("biletflow:entry:abc")).toBe(true);
    expect(isEntryConfirmation("biletflow:ticket:abc")).toBe(false);
  });

  it("accepts exactly eight digits", () => {
    expect(isEntryCode("12345678")).toBe(true);
    expect(isEntryCode("1234567")).toBe(false);
    expect(isEntryCode("1234567a")).toBe(false);
  });
});
