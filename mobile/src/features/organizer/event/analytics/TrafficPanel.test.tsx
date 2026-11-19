import { render, screen } from "@testing-library/react-native";

import { getTraffic } from "@/api/analytics";
import type { TrafficReport } from "@/api/types/analytics";
import { setLocale } from "@/i18n";

import { TrafficPanel } from "./TrafficPanel";

jest.mock("@/api/analytics");

const report = (over: Partial<TrafficReport>): TrafficReport => ({
  event_id: "event-1",
  source: "ga4",
  state: "disabled",
  error: null,
  timezone: "Asia/Almaty",
  range: { from: "2026-10-22", to: "2026-11-19" },
  fetched_at: null,
  expires_at: null,
  metrics: null,
  definitions: {},
  ...over,
});

const METRICS = {
  campaign_landing: { event_count: 4, users: 3 },
  event_view: { event_count: 40, users: 25 },
  checkout_start: { event_count: 9, users: 8 },
  purchase: { event_count: 5, users: 5 },
  refund: { event_count: 0, users: 0 },
};

describe("TrafficPanel", () => {
  afterEach(() => setLocale("en"));

  // Done when (#131): with GA4_ENABLED=false the section says so, with no numbers.
  it("explains that traffic analytics is off, without showing zeros", async () => {
    jest.mocked(getTraffic).mockResolvedValue(report({ state: "disabled" }));
    await render(<TrafficPanel eventId="event-1" />);
    expect(await screen.findByText("Traffic analytics is turned off on this platform, so there is nothing to show.")).toBeTruthy();
    expect(screen.getByText("Off")).toBeTruthy();
    expect(screen.queryByText(/events ·/)).toBeNull();
    expect(getTraffic).toHaveBeenCalledWith("event-1");
  });

  it("tells the organizer when the organization is not connected", async () => {
    jest.mocked(getTraffic).mockResolvedValue(report({ state: "not_connected" }));
    await render(<TrafficPanel eventId="event-1" />);
    expect(await screen.findByText(/isn’t connected to Google Analytics/)).toBeTruthy();
  });

  it("shows the funnel counts when fresh", async () => {
    jest.mocked(getTraffic).mockResolvedValue(report({ state: "fresh", fetched_at: "2026-11-19T10:00:00Z", metrics: METRICS }));
    await render(<TrafficPanel eventId="event-1" />);
    expect(await screen.findByText("Viewed the event page")).toBeTruthy();
    expect(screen.getByText("40 events · 25 people")).toBeTruthy();
    expect(screen.getByText("Started checkout")).toBeTruthy();
    expect(screen.getByText("Up to date")).toBeTruthy();
    expect(screen.getByText(/^From 2026-10-22 until 2026-11-19 · fetched /)).toBeTruthy();
  });

  it("marks last saved numbers when a refresh failed", async () => {
    jest.mocked(getTraffic).mockResolvedValue(report({ state: "stale", error: "ga4_unavailable", fetched_at: "2026-11-18T10:00:00Z", metrics: METRICS }));
    await render(<TrafficPanel eventId="event-1" />);
    expect(await screen.findByText("Refreshing failed; these are the last saved numbers.")).toBeTruthy();
    expect(screen.getByText("40 events · 25 people")).toBeTruthy();
  });

  it("says GA4 is unreachable instead of showing numbers", async () => {
    jest.mocked(getTraffic).mockResolvedValue(report({ state: "unavailable", error: "ga4_unavailable" }));
    await render(<TrafficPanel eventId="event-1" />);
    expect(await screen.findByText("Google Analytics can’t be reached right now. Try again later.")).toBeTruthy();
    expect(screen.getByText("No data")).toBeTruthy();
  });

  it("is translated", async () => {
    setLocale("ru");
    jest.mocked(getTraffic).mockResolvedValue(report({ state: "disabled" }));
    await render(<TrafficPanel eventId="event-1" />);
    expect(await screen.findByText("Аналитика трафика на этой платформе выключена, поэтому показывать нечего.")).toBeTruthy();
  });
});
