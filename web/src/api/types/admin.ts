// Mirrors backend/app/admin_schemas.py and the search columns in
// admin_service.py (backend/ADMIN_API.md).
import type { Page } from "./admission";

export type { Page };

export interface AdminMe {
  user_id: string;
  is_platform_admin: boolean;
}

export interface AdminUserRow {
  id: string;
  email: string;
  display_name: string;
  status: "active" | "suspended" | string;
  email_verified_at: string | null;
  created_at: string;
  is_platform_admin: boolean;
}

export interface AdminEventRow {
  id: string;
  organization_id: string;
  title: string;
  publication_state: string;
  moderation_state: "normal" | "suspended" | string;
  visibility: string;
  starts_at: string;
  capacity: number;
  created_at: string;
}

export interface AdminOrderRow {
  id: string;
  event_id: string;
  buyer_user_id: string;
  buyer_email: string;
  status: string;
  gross_minor: number;
  discount_minor: number;
  payable_minor: number;
  processing_fee_minor: number;
  created_at: string;
  confirmed_at: string | null;
}

export interface AdminTicketRow {
  id: string;
  event_id: string;
  order_id: string;
  ticket_type_name: string;
  recipient_email: string;
  status: string;
  claimed: boolean;
  issued_at: string;
}

export interface ModerationAction {
  id: string;
  target_user_id: string | null;
  target_event_id: string | null;
  action: string;
  reason: string;
  actor_user_id: string;
  created_at: string;
}

export type ReportStatus = "open" | "reviewing" | "resolved";

export interface EventReport {
  id: string;
  event_id: string;
  reporter_user_id: string;
  category: string;
  description: string;
  status: ReportStatus;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  resolved_by_user_id: string | null;
  resolution: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface PlatformSetting {
  key: string;
  description: string;
  value: number;
  version: number;
  effective_at: string | null;
  default: number;
  minimum: number;
  maximum: number;
  pending: { version: number; value: number; effective_at: string } | null;
}

export interface SettingUpdate {
  value: number;
  expected_version: number;
  effective_at?: string;
  reason?: string;
}

export type ExportKind = "users" | "events" | "orders" | "tickets";

export interface AdminSearch {
  q?: string;
  status?: string;
  limit: number;
  offset: number;
}
