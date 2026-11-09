import { useEffect } from "react";
import { useLocation } from "react-router";
import { useAuth } from "../features/auth/AuthContext";
import { trackTraffic } from "./traffic";

export function TrafficAnalytics() {
  const { pathname } = useLocation();
  const { profile } = useAuth();
  const consent = profile?.analytics_consent === true;
  useEffect(() => {
    trackTraffic(pathname, consent, import.meta.env.VITE_GA4_MEASUREMENT_ID ?? "");
  }, [pathname, consent]);
  return null;
}
