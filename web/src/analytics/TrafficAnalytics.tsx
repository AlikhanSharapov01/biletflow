import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { useAuth } from "../features/auth/AuthContext";
import { eventIdFromPath, measure } from "./traffic";

// Counts a view of a public event page (GA4 view_item) for consenting people.
// Each visit to an event page is sent once, not again on every re-render.
export function TrafficAnalytics() {
  const { pathname } = useLocation();
  const { profile } = useAuth();
  const consent = profile?.analytics_consent === true;
  const last = useRef("");
  useEffect(() => {
    const eventId = eventIdFromPath(pathname);
    if (!consent || !eventId) {
      last.current = "";
      return;
    }
    if (last.current === pathname) return;
    last.current = pathname;
    measure(profile, "event_view", eventId);
    // The profile object changes on every save; only consent matters here.
  }, [pathname, consent]);
  return null;
}
