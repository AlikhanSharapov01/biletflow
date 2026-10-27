// Base already includes /api/v1 — matches the root README's documented
// convention for configuring the mobile client (see "Work on the mobile
// client"), e.g. EXPO_PUBLIC_API_URL=http://192.168.1.20:8080/api/v1 to go
// through the Caddy proxy from a physical device on the same network.
// `localhost` resolves to the device itself, not your dev machine, on a
// physical phone or an Android emulator — override accordingly:
// Android emulator -> http://10.0.2.2:8000/api/v1, physical device -> your
// machine's LAN IP, ideally through Caddy on :8080 rather than the API's
// direct :8000 (matches how the web client reaches it too).
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

// The backend sends only a stable `code` on errors, never user-facing copy:
// {"detail": {"code": "...", "fields"?: [...]}}. Each caller maps the codes
// it expects to messages; anything else gets the generic fallback.
type ErrorBody = {
  detail?: {
    code?: string;
    fields?: unknown[];
  };
};

// Wording shared with the web client (web/src/live.js messages).
const COMMON_MESSAGES: Record<string, string> = {
  rate_limited: "Too many attempts. Please wait a moment and try again.",
  permission_denied: "You don’t have permission to perform that action.",
  organization_not_found: "That organizer workspace is no longer available.",
  event_not_found: "That event is no longer available.",
  event_not_publishable: "This event cannot be published yet. Check its dates and ticket setup.",
  usable_ticket_type_required: "Add an available ticket type before publishing this event.",
  invalid_input: "Some details need attention. Review the form and try again.",
  invalid_filter_range: "The selected filter range is invalid.",
  database_unavailable: "The service is temporarily unavailable. Please try again shortly.",
};

// Unknown codes fall back by status, as the web's failureMessage does.
function statusMessage(status: number): string {
  if (status === 403) return "You don’t have permission to do that.";
  if (status === 404) return "This item could not be found.";
  if (status === 409) return "This change conflicts with the current event setup.";
  if (status >= 500) return "The service is temporarily unavailable. Please try again shortly.";
  return `Something went wrong (${status}). Please try again.`;
}

export async function friendlyError(
  response: Response,
  messages: Record<string, string> = {}
): Promise<Error> {
  let body: ErrorBody | undefined;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  const code = body?.detail?.code;
  const message =
    (code && (messages[code] ?? COMMON_MESSAGES[code])) ?? statusMessage(response.status);
  return new Error(message);
}

export function networkError(): Error {
  return new Error("Couldn't reach the server. Check your connection and try again.");
}
