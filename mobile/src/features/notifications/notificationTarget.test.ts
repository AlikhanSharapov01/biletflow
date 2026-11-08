import {
  announceNotificationsChanged,
  hrefForPath,
  notificationHref,
  notificationPath,
  subscribeNotificationsChanged,
  unreadBadgeLabel,
} from "./notificationTarget";

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

describe("hrefForPath", () => {
  it("maps web paths to app routes", () => {
    expect(hrefForPath("/events/e1")).toEqual({ pathname: "/events/[eventId]", params: { eventId: "e1" } });
    expect(hrefForPath("/tickets/t%201")).toEqual({ pathname: "/tickets/[ticketId]", params: { ticketId: "t 1" } });
    expect(hrefForPath("/orders/o1")).toEqual({ pathname: "/orders/[orderId]", params: { orderId: "o1" } });
    expect(hrefForPath("/support/cases/c1?x=1")).toEqual({ pathname: "/support/cases/[caseId]", params: { caseId: "c1" } });
    expect(hrefForPath("/support")).toBe("/support");
    expect(hrefForPath("/organizer/finance")).toBeNull();
  });

  it("gives a notification's app route", () => {
    expect(notificationHref({ target: { type: "ticket", id: "t1" }, event_id: null })).toEqual({
      pathname: "/tickets/[ticketId]",
      params: { ticketId: "t1" },
    });
    expect(notificationHref({ target: { type: "other", id: null }, event_id: null })).toBeNull();
  });
});

describe("unreadBadgeLabel", () => {
  it("caps the badge at 99+", () => {
    expect(unreadBadgeLabel(7)).toBe("7");
    expect(unreadBadgeLabel(150)).toBe("99+");
  });
});

describe("notifications changed", () => {
  it("tells subscribers until they unsubscribe", () => {
    const listener = jest.fn();
    const unsubscribe = subscribeNotificationsChanged(listener);
    announceNotificationsChanged();
    unsubscribe();
    announceNotificationsChanged();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
