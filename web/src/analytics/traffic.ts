import { postMeasurement } from "../api/analytics";
import type { Profile } from "../api/types/auth";
import type { MeasurementName } from "../api/types/analytics";

// Traffic measurements go through the backend's shared contract
// (POST /analytics/measurements, backend/ANALYTICS_API.md), never from the
// browser to Google. The server checks consent again, keeps only allowlisted
// references and sends them to GA4 itself, so no Google script is loaded here.

// The public route templates the backend keeps for each measurement; it
// reduces every other path anyway.
const PAGE_PATH: Record<MeasurementName, string> = {
  event_view: "/events/event",
  checkout_start: "/events/event",
  campaign_landing: "/c/campaign",
};

// The event on a public event page (/events/:eventId); null on every other
// route, so account, order, ticket, support, auth and admin pages are never measured.
export function eventIdFromPath(path: string): string | null {
  const match = /^\/events\/([^/]+)\/?$/.exec(path);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

// One measurement, only for a signed-in person who allowed traffic analytics
// in Account. A refusal or failure never affects the page: analytics is optional.
export function measure(profile: Profile | null | undefined, name: MeasurementName, eventId: string): void {
  if (!profile?.analytics_consent || !eventId) return;
  void postMeasurement({
    name,
    analytics_event_id: crypto.randomUUID(),
    event_id: eventId,
    platform: "web",
    page_path: PAGE_PATH[name],
  }).catch(() => undefined);
}
