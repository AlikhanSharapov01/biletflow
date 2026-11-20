import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getTraffic } from "../../../../api/analytics";
import type { TrafficReport } from "../../../../api/types/analytics";
import { setLocale } from "../../../../i18n";
import { TrafficPanel } from "./TrafficPanel";

vi.mock("../../../../api/analytics", () => ({ getTraffic: vi.fn() }));
afterEach(() => {
  vi.clearAllMocks();
  setLocale("en");
});

const report = (over: Partial<TrafficReport>): TrafficReport => ({
  event_id: "e1", source: "ga4", state: "disabled", error: null, timezone: "Asia/Almaty",
  range: { from: "2026-10-23", to: "2026-11-20" }, fetched_at: null, expires_at: null, metrics: null, definitions: {},
  ...over,
});
const METRICS = {
  campaign_landing: { event_count: 4, users: 3 },
  event_view: { event_count: 40, users: 25 },
  checkout_start: { event_count: 9, users: 8 },
  purchase: { event_count: 5, users: 5 },
  refund: { event_count: 0, users: 0 },
};

describe("traffic panel", () => {
  // Done when (#131): with GA4_ENABLED=false the section says so, with no numbers.
  it("explains that traffic analytics is off, without a table of zeros", async () => {
    vi.mocked(getTraffic).mockResolvedValue(report({ state: "disabled" }));
    render(<TrafficPanel eventId="e1" />);
    expect(await screen.findByText("Traffic analytics is turned off on this platform, so there is nothing to show.")).toBeTruthy();
    expect(screen.getByText("Off")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(getTraffic).toHaveBeenCalledWith("e1");
  });

  it("points to the workspace when the organization is not connected", async () => {
    vi.mocked(getTraffic).mockResolvedValue(report({ state: "not_connected" }));
    render(<TrafficPanel eventId="e1" />);
    expect(await screen.findByText(/The owner can connect it in the organizer workspace/)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows the funnel in visiting order when fresh", async () => {
    vi.mocked(getTraffic).mockResolvedValue(report({ state: "fresh", fetched_at: "2026-11-20T10:00:00Z", metrics: METRICS }));
    render(<TrafficPanel eventId="e1" />);
    const rows = await screen.findAllByRole("row");
    expect(rows.map((row) => row.textContent)).toEqual([
      "StepEventsPeople",
      "Opened a campaign link43",
      "Viewed the event page4025",
      "Started checkout98",
      "Purchases reported to GA455",
      "Refunds reported to GA400",
    ]);
    expect(screen.getByText("Up to date")).toBeTruthy();
    expect(screen.getByText(/^From 2026-10-23 until 2026-11-20 · fetched /)).toBeTruthy();
  });

  it("marks the last saved numbers when a refresh failed", async () => {
    vi.mocked(getTraffic).mockResolvedValue(report({ state: "stale", error: "ga4_unavailable", fetched_at: "2026-11-19T10:00:00Z", metrics: METRICS }));
    render(<TrafficPanel eventId="e1" />);
    expect(await screen.findByText("Refreshing failed; these are the last saved numbers.")).toBeTruthy();
    expect(screen.getByText("Last saved")).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("says Google Analytics is unreachable instead of showing numbers", async () => {
    vi.mocked(getTraffic).mockResolvedValue(report({ state: "unavailable", error: "ga4_unavailable" }));
    render(<TrafficPanel eventId="e1" />);
    expect(await screen.findByText("Google Analytics can’t be reached right now. Try again later.")).toBeTruthy();
    expect(screen.getByText("No data")).toBeTruthy();
  });

  it("is translated", async () => {
    setLocale("kk");
    vi.mocked(getTraffic).mockResolvedValue(report({ state: "disabled" }));
    render(<TrafficPanel eventId="e1" />);
    expect(await screen.findByText("Бұл платформада трафик талдауы өшірулі, сондықтан көрсететін ештеңе жоқ.")).toBeTruthy();
  });
});
