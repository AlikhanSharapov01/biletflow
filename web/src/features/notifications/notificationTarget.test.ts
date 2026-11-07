import { describe, expect, it } from "vitest";
import { notificationPath, unreadBadgeLabel } from "./notificationTarget";

describe("notificationPath", () => {
  it("routes each target type to its page", () => {
    expect(notificationPath({ target: { type: "event", id: "e1" }, event_id: null })).toBe("/events/e1");
    expect(notificationPath({ target: { type: "ticket", id: "t1" }, event_id: "e1" })).toBe("/tickets/t1");
    expect(notificationPath({ target: { type: "support_case", id: "c1" }, event_id: null })).toBe("/support/cases/c1");
  });

  it("falls back to the event, then to nothing", () => {
    expect(notificationPath({ target: { type: "other", id: null }, event_id: "e2" })).toBe("/events/e2");
    expect(notificationPath({ target: { type: "other", id: null }, event_id: null })).toBeNull();
  });
});

describe("unreadBadgeLabel", () => {
  it("caps the badge at 99+", () => {
    expect(unreadBadgeLabel(7)).toBe("7");
    expect(unreadBadgeLabel(150)).toBe("99+");
  });
});
