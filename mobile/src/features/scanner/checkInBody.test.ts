import { checkInBody } from "@/api/scanner";

describe("checkInBody", () => {
  it("sends the scanned QR with an entry confirmation", () => {
    expect(checkInBody({ qrPayload: "q", entryConfirmation: "biletflow:entry:x" }, "op", "now")).toEqual({
      qr_payload: "q",
      entry_confirmation: "biletflow:entry:x",
      operation_id: "op",
      captured_at: "now",
    });
  });

  it("sends a ticket id from manual search instead of a QR", () => {
    expect(checkInBody({ ticketId: "t1", entryCode: "12345678" }, "op", "now")).toEqual({
      ticket_id: "t1",
      entry_code: "12345678",
      operation_id: "op",
      captured_at: "now",
    });
  });
});
