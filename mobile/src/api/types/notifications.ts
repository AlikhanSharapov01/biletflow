// In-app notification shapes mirrored from backend/app/notification_api.py
// (contract: backend/NOTIFICATIONS_CALENDAR_API.md, BF-15).

export type NotificationKind =
  | "event_updated"
  | "event_cancelled"
  | "ticket_delivered"
  | "support_reply"
  | "support_status"
  | "purchase_confirmed"
  | "payment_failed"
  | "refund_started"
  | "refund_completed"
  | "order_cancelled"
  // Moderation decisions (backend/NOTIFICATIONS_CALENDAR_API.md, "Moderation notices").
  | "account_suspended"
  | "account_reinstated"
  | "event_suspended"
  | "event_reinstated"
  | "paid_sales_suspended"
  | "paid_sales_reinstated";

export interface NotificationTarget {
  // organizer_event: the organizer's view of an event; account: no id.
  type: "event" | "ticket" | "support_case" | "order" | "organizer_event" | "account" | string;
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
