import { afterEach, expect, it, vi } from "vitest";
import { trackTraffic, trafficPath } from "./traffic";

afterEach(() => { vi.restoreAllMocks(); });

it("excludes sensitive routes and replaces event IDs", () => {
  expect(trafficPath("/events/secret-event-id")).toBe("/events/event");
  for (const path of ["/tickets/private-id", "/orders/private-id", "/support", "/admin/users", "/verify-email", "/c/secret"]) {
    expect(trafficPath(path)).toBeNull();
  }
});

it("loads nothing without consent or configuration; sanitizes consented page views", () => {
  const append = vi.spyOn(document.head, "append").mockImplementation(() => {});
  trackTraffic("/discover", false, "G-TEST123");
  trackTraffic("/discover", true, "");
  expect(append).not.toHaveBeenCalled();
  trackTraffic("/events/private-id", true, "G-TEST123");
  expect(append).toHaveBeenCalledTimes(1);
  const target = window as unknown as { dataLayer: IArguments[]; [key: string]: unknown };
  const events = target.dataLayer.map((args) => Array.from(args));
  expect(JSON.stringify(events)).not.toContain("private-id");
  expect(events.at(-1)).toMatchObject(["event", "page_view", { page_location: `${window.location.origin}/events/event`, page_referrer: "" }]);
  const count = target.dataLayer.length;
  trackTraffic("/events/private-id", true, "G-TEST123");
  expect(target.dataLayer).toHaveLength(count);
  trackTraffic("/discover", false, "G-TEST123");
  expect(target["ga-disable-G-TEST123"]).toBe(true);
  expect(target.dataLayer).toHaveLength(count);
});
