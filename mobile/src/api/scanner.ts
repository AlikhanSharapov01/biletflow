// Client for the online admission API — backend/ADMISSION_API.md, routes in
// backend/app/admission_api.py, types mirroring backend/app/admission_schemas.py.

import { friendlyError } from "@/api/client";
import { authedFetch, SessionExpiredError } from "@/api/session";
import type {
  AdmissionCounts,
  AssignedEvent,
  AttendeeHit,
  CheckInOutcome,
  CheckInResult,
  CheckInTarget,
  ReversalResult,
} from "@/api/types/scanner";

const SCANNER_MESSAGES: Record<string, string> = {
  event_not_found: "You're not assigned to scan this event.",
  permission_denied: "You don't have permission to scan this event.",
};

async function getJson<T>(path: string): Promise<T | null> {
  const response = await authedFetch(path);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw await friendlyError(response, SCANNER_MESSAGES);
  }
  return response.json() as Promise<T>;
}

// Published events this account may scan, ordered by start time.
export async function listAssignedEvents(): Promise<AssignedEvent[]> {
  return (await getJson<AssignedEvent[]>("/scanner/events")) ?? [];
}

// null when the event doesn't exist or isn't assigned to this account.
export function getAssignedEvent(id: string): Promise<AssignedEvent | null> {
  return getJson<AssignedEvent>(`/scanner/events/${encodeURIComponent(id)}`);
}

export async function getAdmissionCounts(eventId: string): Promise<AdmissionCounts | null> {
  return getJson<AdmissionCounts>(`/scanner/events/${encodeURIComponent(eventId)}/counts`);
}

// Manual search (2+ characters of the name, or an exact email). Hits carry no
// email, order or payment data.
export async function searchAttendees(eventId: string, query: string): Promise<AttendeeHit[]> {
  const params = new URLSearchParams({ q: query, limit: "10" });
  return (
    (await getJson<AttendeeHit[]>(`/scanner/events/${encodeURIComponent(eventId)}/attendees?${params}`)) ?? []
  );
}

// The request body for one check-in: exactly one of the scanned QR or a ticket
// id from manual search, plus the attendee's entry confirmation (scanned
// token or 8-digit code) when the event requires one.
export function checkInBody(target: CheckInTarget, operationId: string, capturedAt: string) {
  return {
    ...(target.ticketId ? { ticket_id: target.ticketId } : { qr_payload: target.qrPayload }),
    ...(target.entryConfirmation ? { entry_confirmation: target.entryConfirmation } : {}),
    ...(target.entryCode ? { entry_code: target.entryCode } : {}),
    operation_id: operationId,
    captured_at: capturedAt,
  };
}

// The QR payload goes to the server untouched — it alone decides what the
// code is (ticket, campaign QR, forgery). Reuse operationId when retrying the
// same scan: the server then returns the original admission (replayed)
// instead of a false "already used".
export async function checkIn(
  eventId: string,
  target: CheckInTarget,
  operationId: string,
  capturedAt: string
): Promise<CheckInOutcome> {
  let response: Response;
  try {
    response = await authedFetch(`/scanner/events/${encodeURIComponent(eventId)}/check-ins`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(checkInBody(target, operationId, capturedAt)),
    });
  } catch (err) {
    // An expired session has already signed the user out; let that surface.
    if (err instanceof SessionExpiredError) throw err;
    return { kind: "network" };
  }

  if (response.ok) {
    return { kind: "admitted", ...((await response.json()) as CheckInResult) };
  }

  let detail: { code?: string; checked_in_at?: string | null; status?: string } = {};
  try {
    detail = ((await response.json()) as { detail?: typeof detail }).detail ?? {};
  } catch {
    // Non-JSON error body (e.g. a proxy page) — falls through to "unknown".
  }
  return {
    kind: "rejected",
    code: detail.code ?? `http_${response.status}`,
    checkedInAt: detail.checked_in_at ?? undefined,
    ticketStatus: detail.status,
  };
}

const REVERSAL_MESSAGES: Record<string, string> = {
  check_in_not_found: "This admission couldn't be found.",
  already_reversed: "This admission has already been undone.",
  event_not_found: "You're no longer assigned to scan this event.",
  permission_denied: "You don't have permission to undo admissions for this event.",
  invalid_input: "Enter a reason for undoing this admission.",
};

// Undoes an accidental admission; the ticket can then be scanned again. Needs
// the reverse_checkin capability, which the event list doesn't expose, so a
// scanner without it only finds out from the permission_denied error here.
export async function reverseCheckIn(checkInId: string, reason: string): Promise<ReversalResult> {
  const response = await authedFetch(`/scanner/check-ins/${encodeURIComponent(checkInId)}/reverse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  if (!response.ok) {
    throw await friendlyError(response, REVERSAL_MESSAGES);
  }
  return response.json() as Promise<ReversalResult>;
}
