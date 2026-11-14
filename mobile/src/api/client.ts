import { t } from "@/i18n";

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
  get rate_limited() { return t("api.rate_limited"); },
  get permission_denied() { return t("api.permission_denied"); },
  get organization_not_found() { return t("api.organization_missing"); },
  get event_not_found() { return t("api.event_missing"); },
  get event_not_publishable() { return t("api.event_not_publishable"); },
  get usable_ticket_type_required() { return t("api.ticket_type_required"); },
  get invalid_input() { return t("errors.validation"); },
  get invalid_filter_range() { return t("api.invalid_filter"); },
  get database_unavailable() { return t("errors.unavailable"); },
};

// Unknown codes fall back by status, as the web's failureMessage does.
function statusMessage(status: number): string {
  if (status === 403) return t("errors.permission");
  if (status === 404) return t("errors.not_found");
  if (status === 409) return t("mobile.api.event_conflict");
  if (status >= 500) return t("errors.unavailable");
  return t("mobile.api.went_wrong_status", { p0: status });
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
  return new Error(t("mobile.api.unreachable"));
}
