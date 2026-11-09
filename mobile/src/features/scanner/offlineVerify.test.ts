import type { OfflineManifest } from "@/api/types/offline";
import { decideOffline, type OfflineScan } from "@/features/scanner/offlineVerify";

// Signed by backend/app/signing.py, so this proves the two sides agree byte for byte.
const PUBLIC_KEY = "JajgGoNvM-qnYKXMvQUVB5zuSe8hqGkSXAb9wn9vkOc";
const TOKEN =
  "biletflow:entry:eyJjaWQiOiIzMzMzMzMzMy0zMzMzLTQzMzMtODMzMy0zMzMzMzMzMzMzMzMiLCJlaWQiOiIyMjIyMjIyMi0yMjIyLTQyMjItODIyMi0yMjIyMjIyMjIyMjIiLCJleHAiOjE3OTQxMzIxMjAsImlhdCI6MTc5NDEzMjAwMCwidGlkIjoiMTExMTExMTEtMTExMS00MTExLTgxMTEtMTExMTExMTExMTExIiwidiI6MX0.fyG1FPped1mteSjArDh1bx_bzHKA2Su2gaSwL1WPsfrrH-b-XIhzm9VcGvNJiHd5ar3E0d7vI7a3SRTVOsICCA";
const TICKET_ID = "11111111-1111-4111-8111-111111111111";
const EVENT_ID = "22222222-2222-4222-8222-222222222222";
const ISSUED = 1794132000 * 1000;
const at = (seconds: number) => new Date(ISSUED + seconds * 1000).toISOString();

const MANIFEST: OfflineManifest = {
  event: { id: EVENT_ID, admission_opens_at: at(-3600), admission_closes_at: at(3600) },
  expires_at: at(7200),
  entry_confirmation: { public_key: PUBLIC_KEY },
  tickets: [
    { ticket_id: TICKET_ID, qr_hash: "hash", ticket_type_name: "Standard", holder: "Aru A.", seat: null, status: "valid" },
  ],
  revocations: [],
  admitted_ticket_ids: [],
};
const CLEAN = { admitted: [], revocations: [] };
const SCAN: OfflineScan = {
  qrPayload: `biletflow:ticket:${TICKET_ID}.sig`,
  qrHash: "hash",
  entryConfirmation: TOKEN,
  capturedAt: at(30),
};
const codeOf = (outcome: ReturnType<typeof decideOffline>) => (outcome.kind === "rejected" ? outcome.code : outcome.kind);

describe("decideOffline", () => {
  it("accepts a known ticket with a backend-signed confirmation", () => {
    expect(decideOffline(MANIFEST, CLEAN, SCAN)).toEqual({
      kind: "queued",
      ticket_id: TICKET_ID,
      attendee_name: "Aru A.",
      ticket_type_name: "Standard",
      seat: null,
    });
  });

  it("rejects a tampered confirmation signature", () => {
    const flipped = TOKEN.slice(0, -2) + (TOKEN.endsWith("CA") ? "DA" : "CA");
    expect(codeOf(decideOffline(MANIFEST, CLEAN, { ...SCAN, entryConfirmation: flipped }))).toBe("invalid_confirmation");
  });

  it("rejects a confirmation for another ticket", () => {
    const tickets = [{ ...MANIFEST.tickets[0], ticket_id: "other" }];
    expect(codeOf(decideOffline({ ...MANIFEST, tickets }, CLEAN, SCAN))).toBe("invalid_confirmation");
  });

  it("applies the server's expiry slack", () => {
    expect(codeOf(decideOffline(MANIFEST, CLEAN, { ...SCAN, capturedAt: at(180) }))).toBe("queued");
    expect(codeOf(decideOffline(MANIFEST, CLEAN, { ...SCAN, capturedAt: at(181) }))).toBe("confirmation_expired");
  });

  it("reports duplicates and revoked tickets before asking for a confirmation", () => {
    const bare = { ...SCAN, entryConfirmation: undefined };
    expect(codeOf(decideOffline(MANIFEST, { ...CLEAN, admitted: [TICKET_ID] }, bare))).toBe("already_checked_in");
    expect(
      decideOffline(MANIFEST, { ...CLEAN, revocations: [{ ticket_id: TICKET_ID, status: "refunded" }] }, bare)
    ).toEqual({ kind: "rejected", code: "ticket_not_valid", ticketStatus: "refunded" });
  });

  it("asks for the QR when there is no confirmation or only a typed code", () => {
    const bare = { ...SCAN, entryConfirmation: undefined };
    expect(codeOf(decideOffline(MANIFEST, CLEAN, bare))).toBe("sign_in_required");
    expect(codeOf(decideOffline(MANIFEST, CLEAN, { ...bare, entryCode: "12345678" }))).toBe("offline_code_unavailable");
  });

  it("rejects other codes, unknown tickets and scans outside admission", () => {
    expect(codeOf(decideOffline(MANIFEST, CLEAN, { ...SCAN, qrPayload: "https://x/promo" }))).toBe("not_a_ticket_qr");
    expect(codeOf(decideOffline(MANIFEST, CLEAN, { ...SCAN, qrHash: "nope" }))).toBe("offline_unknown_ticket");
    expect(codeOf(decideOffline(MANIFEST, CLEAN, { ...SCAN, capturedAt: at(-3601) }))).toBe("admission_not_open");
    expect(codeOf(decideOffline(MANIFEST, CLEAN, { ...SCAN, capturedAt: at(3600) }))).toBe("admission_closed");
  });
});
