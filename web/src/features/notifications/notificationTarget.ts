import type { AppNotification } from "../../api/types/notifications";

// Where a notification leads. Opening the target still goes through that
// record's own permission check; the notification grants nothing.
export function notificationPath(notification: Pick<AppNotification, "target" | "event_id"> & { kind?: string }): string | null {
  const { type, id } = notification.target;
  // Simulated payout updates belong to the organizer's event finance.
  if (notification.kind === "payout_status" && notification.event_id) return `/organizer/events/${encodeURIComponent(notification.event_id)}`;
  // Moderation notices about the person's own account.
  if (type === "account") return "/account";
  if (id) {
    const encoded = encodeURIComponent(id);
    if (type === "organizer_event") return `/organizer/events/${encoded}`;
    if (type === "event") return `/events/${encoded}`;
    if (type === "ticket") return `/tickets/${encoded}`;
    if (type === "support_case") return `/support/cases/${encoded}`;
    if (type === "order") return `/orders/${encoded}`;
  }
  return notification.event_id ? `/events/${encodeURIComponent(notification.event_id)}` : null;
}

export function unreadBadgeLabel(count: number): string {
  return count > 99 ? "99+" : String(count);
}

// The bell listens for this so marking items read updates its badge at once.
export const NOTIFICATIONS_CHANGED = "biletflow:notifications-changed";

export function announceNotificationsChanged(): void {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}
