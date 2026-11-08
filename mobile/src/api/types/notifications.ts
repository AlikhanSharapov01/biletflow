// In-app notification shapes mirrored from backend/app/notification_api.py
// (contract: backend/NOTIFICATIONS_CALENDAR_API.md, BF-15).

export type NotificationKind =
  | "event_updated"
  | "event_cancelled"
  | "ticket_delivered"
  | "support_reply"
  | "support_status";

export interface NotificationTarget {
  type: "event" | "ticket" | "support_case" | string;
  id: string | null;
}

export interface AppNotification {
  id: string;
  kind: NotificationKind | string;
  locale: string;
  title: string;
  body: string;
  event_id: string | null;
  target: NotificationTarget;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface NotificationQuery {
  unread_only?: boolean;
  limit?: number;
  offset?: number;
}
