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

const COMMON_MESSAGES: Record<string, string> = {
  rate_limited: "Too many attempts. Please wait a moment and try again.",
};

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
    (code && (messages[code] ?? COMMON_MESSAGES[code])) ??
    `Something went wrong (${response.status}). Please try again.`;
  return new Error(message);
}

export function networkError(): Error {
  return new Error("Couldn't reach the server. Check your connection and try again.");
}
