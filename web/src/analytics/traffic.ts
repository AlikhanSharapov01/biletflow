// Only public route templates reach GA4. Never send IDs, search terms, tokens,
// query strings, hashes, user details, or the browser's original referrer.
export function trafficPath(path: string): string | null {
  if (path === "/discover" || path === "/") return "/discover";
  if (/^\/events\/[^/]+\/?$/.test(path)) return "/events/event";
  return null;
}

type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  [key: `ga-disable-${string}`]: boolean;
};
let initialized = false;
let lastLocation = "";

export function trackTraffic(path: string, consent: boolean, measurementId: string): void {
  if (!/^G-[A-Z0-9]+$/.test(measurementId)) return;
  const target = window as unknown as AnalyticsWindow;
  target[`ga-disable-${measurementId}`] = !consent;
  if (!consent) {
    lastLocation = "";
    return;
  }
  const safePath = trafficPath(path);
  if (!safePath) return;
  const location = `${window.location.origin}${safePath}`;
  const command = (...args: unknown[]) => {
    // gtag expects Arguments objects in dataLayer.
    function push() { target.dataLayer!.push(arguments); }
    Reflect.apply(push, undefined, args);
  };
  if (!initialized) {
    target.dataLayer ??= [];
    command("js", new Date());
    command("config", measurementId, {
      send_page_view: false,
      page_location: location,
      page_referrer: "",
      page_title: "BiletFlow",
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.append(script);
    initialized = true;
  }
  if (location === lastLocation) return;
  command("event", "page_view", {
    send_to: measurementId,
    page_location: location,
    page_referrer: "",
    page_title: safePath === "/discover" ? "Discover events" : "Event details",
  });
  lastLocation = location;
}
