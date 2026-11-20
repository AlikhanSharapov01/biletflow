import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postMeasurement } from "../api/analytics";
import type { Profile } from "../api/types/auth";
import { eventIdFromPath, measure } from "./traffic";

vi.mock("../api/analytics", () => ({ postMeasurement: vi.fn() }));

const consenting: Profile = { id: "u1", email: "a@example.com", display_name: "A", locale: "en", email_verified_at: null, analytics_consent: true } as Profile;

beforeEach(() => {
  vi.mocked(postMeasurement).mockResolvedValue({ status: "accepted", reason: null });
  vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");
});
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("traffic measurements", () => {
  it("measures only public event pages, never account, order, ticket, support, auth or admin routes", () => {
    expect(eventIdFromPath("/events/e1")).toBe("e1");
    expect(eventIdFromPath("/events/e1/")).toBe("e1");
    for (const path of ["/", "/discover", "/tickets/t1", "/orders/o1", "/support", "/admin/users", "/verify-email", "/c/secret", "/organizer/events/e1", "/events/e1/edit"]) {
      expect(eventIdFromPath(path)).toBeNull();
    }
  });

  it("sends only the allowlisted fields through the backend, never to Google", () => {
    const append = vi.spyOn(document.head, "append");
    measure(consenting, "event_view", "e1");
    expect(postMeasurement).toHaveBeenCalledWith({
      name: "event_view",
      analytics_event_id: "00000000-0000-4000-8000-000000000001",
      event_id: "e1",
      platform: "web",
      page_path: "/events/event",
    });
    expect(append).not.toHaveBeenCalled();
    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
  });

  it("sends nothing without consent or when signed out", () => {
    measure({ ...consenting, analytics_consent: false }, "event_view", "e1");
    measure(null, "checkout_start", "e1");
    expect(postMeasurement).not.toHaveBeenCalled();
  });

  it("never lets a failed measurement reach the page", async () => {
    vi.mocked(postMeasurement).mockRejectedValue(new Error("rate_limited"));
    expect(() => measure(consenting, "campaign_landing", "e1")).not.toThrow();
    await Promise.resolve();
  });
});
