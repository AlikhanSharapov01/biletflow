// Client for the scanner API family proposed in
// docs/BiletFlow_Backend_Requirements.md (BF-11, §8 "/scanner": assigned
// events, attendee lookup, admission, reversal, counts). The backend hasn't
// built it yet, so everything here runs on mock data unless
// EXPO_PUBLIC_SCANNER_MOCKS=false. Field names reuse the backend's existing
// EventView/VenueView (backend/app/catalog_schemas.py) so the real endpoint
// should drop in without reshaping; re-check against OpenAPI when it lands.

import { API_URL, friendlyError, networkError } from "@/api/client";
import { mockAssignedEvents } from "@/api/scannerMocks";
import { getTokens } from "@/api/tokenStorage";

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

export const USE_SCANNER_MOCKS = process.env.EXPO_PUBLIC_SCANNER_MOCKS !== "false";

// An authenticated endpoint answers an expired/revoked session with the
// backend's generic 401 code (security.fail() default).
const SCANNER_MESSAGES: Record<string, string> = {
  invalid_credentials: "Your session has expired. Please sign in again.",
};

function mockDelay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), 300));
}

async function authedGet<T>(path: string): Promise<T | null> {
  const { accessToken } = await getTokens();
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
  } catch {
    throw networkError();
  }

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw await friendlyError(response, SCANNER_MESSAGES);
  }
  return response.json() as Promise<T>;
}

// Events this account is assigned to scan. Like the backend's other list
// endpoints, assumed to return a plain array.
export async function listAssignedEvents(): Promise<AssignedEvent[]> {
  if (USE_SCANNER_MOCKS) {
    return mockDelay(mockAssignedEvents());
  }
  const events = await authedGet<AssignedEvent[]>("/scanner/events");
  if (events === null) {
    throw new Error("The scanner service isn't available yet.");
  }
  return events;
}

// null when the event doesn't exist or isn't assigned to this account — the
// backend returns 404 for inaccessible scoped resources (CATALOG_API.md).
export async function getAssignedEvent(id: string): Promise<AssignedEvent | null> {
  if (USE_SCANNER_MOCKS) {
    return mockDelay(mockAssignedEvents().find((event) => event.id === id) ?? null);
  }
  return authedGet<AssignedEvent>(`/scanner/events/${encodeURIComponent(id)}`);
}
