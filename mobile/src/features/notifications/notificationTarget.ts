import type { Href } from "expo-router";

import type { AppNotification } from "@/api/types/notifications";

// Where a notification leads, as the web path the backend's emails also use.
// Opening the target still goes through that record's own permission check;
// the notification grants nothing.
export function notificationPath(notification: Pick<AppNotification, "target" | "event_id">): string | null {
  const { type, id } = notification.target;
  if (id) {
    const encoded = encodeURIComponent(id);
    if (type === "event") return `/events/${encoded}`;
    if (type === "ticket") return `/tickets/${encoded}`;
    if (type === "support_case") return `/support/cases/${encoded}`;
  }
  return notification.event_id ? `/events/${encodeURIComponent(notification.event_id)}` : null;
}

function decoded(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

// Maps a web path to the app's route; null for anything the app has no screen for.
export function hrefForPath(path: string): Href | null {
  const parts = path.split(/[?#]/)[0]?.split("/").filter(Boolean) ?? [];
  const [first, second, third] = parts;
  if (first === "events" && second && parts.length === 2) {
    return { pathname: "/events/[eventId]", params: { eventId: decoded(second) } };
  }
  if (first === "tickets" && second && parts.length === 2) {
    return { pathname: "/tickets/[ticketId]", params: { ticketId: decoded(second) } };
  }
  if (first === "orders" && second && parts.length === 2) {
    return { pathname: "/orders/[orderId]", params: { orderId: decoded(second) } };
  }
  if (first === "support" && second === "cases" && third && parts.length === 3) {
    return { pathname: "/support/cases/[caseId]", params: { caseId: decoded(third) } };
  }
  if (first === "tickets" && parts.length === 1) return "/tickets";
  if (first === "orders" && parts.length === 1) return "/orders";
  if (first === "support" && parts.length === 1) return "/support";
  if (first === "notifications" && parts.length === 1) return "/notifications";
  return null;
}

export function notificationHref(notification: Pick<AppNotification, "target" | "event_id">): Href | null {
  const path = notificationPath(notification);
  return path ? hrefForPath(path) : null;
}

export function unreadBadgeLabel(count: number): string {
  return count > 99 ? "99+" : String(count);
}

// The bell subscribes here so marking items read updates its badge at once
// (the web dispatches a window event for the same purpose).
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeNotificationsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function announceNotificationsChanged(): void {
  for (const listener of [...listeners]) listener();
}
