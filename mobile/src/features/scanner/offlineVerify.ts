// The door decision when the server can't be reached, following the checks in
// backend/ADMISSION_API.md. Results are provisional: the server decides at sync.

import { ed25519 } from "@noble/curves/ed25519";

import type { OfflineManifest, OfflineRevocation, OfflineTicket } from "@/api/types/offline";
import type { CheckInOutcome } from "@/api/types/scanner";
import { ENTRY_CONFIRMATION_PREFIX } from "@/features/scanner/outcomes";

export const TICKET_QR_PREFIX = "biletflow:ticket:";

const ENTRY_PURPOSE = "entry_confirmation";
// Matches OFFLINE_LEEWAY in backend/app/entry_service.py.
const LEEWAY_SECONDS = 60;
const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function decodeBase64Url(text: string): Uint8Array {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of text) {
    const value = BASE64URL.indexOf(char);
    if (value < 0) throw new Error("not base64url");
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
      buffer &= (1 << bits) - 1;
    }
  }
  return Uint8Array.from(bytes);
}

function ascii(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes);
}

type EntryClaims = { tid: string; eid: string; iat: number; exp: number };

// The claims of a genuinely signed token, or null.
function readEntryToken(token: string, publicKey: string): EntryClaims | null {
  if (!token.startsWith(ENTRY_CONFIRMATION_PREFIX)) return null;
  const [body, signature, ...rest] = token.slice(ENTRY_CONFIRMATION_PREFIX.length).split(".");
  if (!body || !signature || rest.length) return null;
  try {
    const claims = decodeBase64Url(body);
    const purpose = Uint8Array.from(`${ENTRY_PURPOSE}\0`, (char) => char.charCodeAt(0));
    const message = new Uint8Array(purpose.length + claims.length);
    message.set(purpose);
    message.set(claims, purpose.length);
    if (!ed25519.verify(decodeBase64Url(signature), message, decodeBase64Url(publicKey))) return null;
    return JSON.parse(ascii(claims)) as EntryClaims;
  } catch {
    return null;
  }
}

function confirmationProblem(
  token: string,
  ticket: OfflineTicket,
  manifest: OfflineManifest,
  capturedSeconds: number
): string | null {
  const claims = readEntryToken(token, manifest.entry_confirmation.public_key);
  if (!claims || claims.tid !== ticket.ticket_id || claims.eid !== manifest.event.id) {
    return "invalid_confirmation";
  }
  if (capturedSeconds > claims.exp + LEEWAY_SECONDS) return "confirmation_expired";
  if (capturedSeconds < claims.iat - LEEWAY_SECONDS) return "invalid_confirmation";
  return null;
}

export type OfflineScan = {
  qrPayload: string;
  // sha256 hex of the payload after its prefix.
  qrHash: string;
  entryConfirmation?: string;
  entryCode?: string;
  capturedAt: string;
};

export type OfflineLedger = {
  admitted: string[];
  revocations: OfflineRevocation[];
};

export function decideOffline(
  manifest: OfflineManifest,
  ledger: OfflineLedger,
  scan: OfflineScan
): CheckInOutcome {
  const rejected = (code: string, ticketStatus?: string): CheckInOutcome => ({ kind: "rejected", code, ticketStatus });
  if (!scan.qrPayload.startsWith(TICKET_QR_PREFIX)) return rejected("not_a_ticket_qr");

  const captured = Date.parse(scan.capturedAt);
  if (captured < Date.parse(manifest.event.admission_opens_at)) return rejected("admission_not_open");
  if (captured >= Date.parse(manifest.event.admission_closes_at)) return rejected("admission_closed");

  const ticket = manifest.tickets.find((row) => row.qr_hash === scan.qrHash);
  if (!ticket) return rejected("offline_unknown_ticket");

  const revoked = ledger.revocations.find((row) => row.ticket_id === ticket.ticket_id);
  if (revoked) return rejected("ticket_not_valid", revoked.status);
  if (ledger.admitted.includes(ticket.ticket_id)) return rejected("already_checked_in");

  // A typed code is only checkable by the server, so it can't vouch for entry here.
  if (!scan.entryConfirmation) return rejected(scan.entryCode ? "offline_code_unavailable" : "sign_in_required");
  const problem = confirmationProblem(scan.entryConfirmation, ticket, manifest, Math.floor(captured / 1000));
  if (problem) return rejected(problem);

  return {
    kind: "queued",
    ticket_id: ticket.ticket_id,
    attendee_name: ticket.holder,
    ticket_type_name: ticket.ticket_type_name,
    seat: ticket.seat,
  };
}
