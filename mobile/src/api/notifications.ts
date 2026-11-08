import { request } from "./http";
import type { AppNotification, NotificationQuery } from "./types/notifications";

// Contract: backend/NOTIFICATIONS_CALENDAR_API.md (BF-15). The inbox is a
// plain array, newest first.
export function listNotifications(query: NotificationQuery = {}): Promise<AppNotification[]> {
  return request<AppNotification[]>("/api/v1/notifications", {
    query: {
      unread_only: query.unread_only ? "true" : undefined,
      limit: query.limit,
      offset: query.offset,
    },
  });
}

export async function unreadNotificationCount(): Promise<number> {
  const result = await request<{ unread: number }>("/api/v1/notifications/unread-count");
  return result.unread;
}

export function markNotificationRead(notificationId: string): Promise<AppNotification> {
  return request<AppNotification>(`/api/v1/notifications/${encodeURIComponent(notificationId)}/read`, { method: "POST" });
}

export async function markAllNotificationsRead(): Promise<number> {
  const result = await request<{ updated: number }>("/api/v1/notifications/read-all", { method: "POST" });
  return result.updated;
}
