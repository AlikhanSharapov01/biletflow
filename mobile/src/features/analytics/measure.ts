import { randomUUID } from "expo-crypto";
import { useEffect, useRef } from "react";

import { postMeasurement } from "@/api/analytics";
import type { Profile } from "@/api/types";
import type { MeasurementName } from "@/api/types/analytics";
import { useAuth } from "@/features/auth/AuthContext";

// The public route templates the backend keeps for each measurement
// (ANALYTICS_API.md); it reduces every other path anyway.
const PAGE_PATH: Record<MeasurementName, string> = {
  event_view: "/events/event",
  checkout_start: "/events/event",
  campaign_landing: "/c/campaign",
};

// Sends one traffic measurement through the shared backend contract, never to
// GA4 directly, and only for a signed-in person who allowed traffic analytics
// (Account > Profile). Only the allowlisted ids go out. A failure or refusal
// never affects the screen: analytics is optional.
export function measure(profile: Profile | null | undefined, name: MeasurementName, eventId: string, campaignId?: string): void {
  if (!profile?.analytics_consent || !eventId) return;
  void postMeasurement({
    name,
    analytics_event_id: randomUUID(),
    event_id: eventId,
    ...(campaignId ? { campaign_id: campaignId } : {}),
    platform: "mobile",
    page_path: PAGE_PATH[name],
  }).catch(() => undefined);
}

// A screen view, sent once per event while the screen stays open.
export function useMeasureView(name: MeasurementName, eventId: string | null | undefined) {
  const { profile } = useAuth();
  const sent = useRef("");
  const consent = profile?.analytics_consent === true;
  useEffect(() => {
    if (!eventId || !consent || sent.current === eventId) return;
    sent.current = eventId;
    measure(profile, name, eventId);
    // Sent again only for another event or after consent is given.
  }, [name, eventId, consent]);
}
