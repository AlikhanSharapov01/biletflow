// Client for the online admission API — backend/ADMISSION_API.md, routes in
// backend/app/admission_api.py, types mirroring backend/app/admission_schemas.py.

import { friendlyError } from "@/api/client";
import { authedFetch, SessionExpiredError } from "@/api/session";

export type AssignedEvent = {
  id: string;
  title: string;
  venue: {
    name: string;
    address: string;
    city: string;
  };
  starts_at: string;
  ends_at: string;
  time_zone: string;
  admission_opens_at: string;
  admission_closes_at: string;
  time_status: "upcoming" | "active" | "completed";
};

export type AdmissionCounts = {
  event_id: string;
  registered: number;
  admitted: number;
};

export type Seat = {
  section_label: string;
  row_label: string;
  seat_label: string;
};

export type CheckInResult = {
  result: string;
  check_in_id: string;
  ticket_id: string;
  event_id: string;
  attendee_name: string;
  ticket_type_name: string;
  seat: Seat | null;
  checked_in_at: string;
  // true when this was a retry of an operation the server already admitted.
  replayed: boolean;
};

// A scan always ends in one of these; business rejections are results, not
// exceptions, so the scan screen can show each one.
export type CheckInOutcome =
  | ({ kind: "admitted" } & CheckInResult)
  | {
      kind: "rejected";
      code: string;
      // already_checked_in: when the earlier admission happened.
      checkedInAt?: string;
      // ticket_not_valid: cancelled / refunded / refund_pending.
      ticketStatus?: string;
    }
  | { kind: "network" };

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

// The QR payload goes to the server untouched — it alone decides what the
// code is (ticket, campaign QR, forgery). Reuse operationId when retrying the
// same scan: the server then returns the original admission (replayed)
// instead of a false "already used".
export async function checkIn(
  eventId: string,
  qrPayload: string,
  operationId: string,
  capturedAt: string
): Promise<CheckInOutcome> {
  let response: Response;
  try {
    response = await authedFetch(`/scanner/events/${encodeURIComponent(eventId)}/check-ins`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        qr_payload: qrPayload,
        operation_id: operationId,
        captured_at: capturedAt,
      }),
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
