import { describe, expect, it } from "vitest";
import type { AppNotification } from "../../api/types/notifications";
import { notificationContent } from "./notificationContent";
import { notificationPath } from "./notificationTarget";

function notice(overrides: Partial<AppNotification>): AppNotification {
  return {
    id: "n1",
    kind: "event_updated",
    locale: "en",
    title: "Stored title",
    body: "Stored body",
    event_id: "e1",
    target: { type: "event", id: "e1" },
    payload: { title: "Demo night" },
    read_at: null,
    archived_at: null,
    created_at: "2026-11-09T10:00:00Z",
    ...overrides,
  } as AppNotification;
}

describe("moderation and payout notifications", () => {
  it("renders moderation notices with the backend wording", () => {
    const content = notificationContent(notice({ kind: "event_suspended", target: { type: "organizer_event", id: "e1" } }));
    expect(content.title).toBe("Event suspended: Demo night");
    expect(content.body).toContain("tickets cannot be sold and check-in is paused");
    expect(content.body).toContain("/organizer/events/e1");
  });

  it("localizes the payout status inside the message", () => {
    const content = notificationContent(notice({ kind: "payout_status", payload: { title: "Demo night", status: "sent" } }));
    expect(content.title).toBe("Simulated payout: sent");
    expect(content.body).toContain("No real money moved.");
  });

  it("opens the organizer event for organizer notices and payouts", () => {
    expect(notificationPath({ target: { type: "organizer_event", id: "e/1" }, event_id: "e/1" })).toBe("/organizer/events/e%2F1");
    expect(notificationPath({ kind: "payout_status", target: { type: "event", id: "e1" }, event_id: "e1" })).toBe("/organizer/events/e1");
    expect(notificationPath({ target: { type: "account", id: null }, event_id: null })).toBe("/account");
  });

  it("keeps the stored text for a kind this client does not know", () => {
    expect(notificationContent(notice({ kind: "future_kind" }))).toEqual({ title: "Stored title", body: "Stored body" });
  });
});
