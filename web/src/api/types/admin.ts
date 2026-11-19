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

export type CommerceKind = "payments" | "failed-payments" | "refunds";
export type ExportKind = "users" | "events" | "orders" | "tickets" | CommerceKind;

// Exact-match filters shared by the payment, failed-payment and refund lists
// and their CSV exports (ADMIN_API.md, "Payment and refund inspection").
// `from`/`to` are offset-bearing instants on the record's created_at.
export interface CommerceFilters {
  status?: string;
  event_id?: string;
  organization_id?: string;
  order_id?: string;
  payer_user_id?: string;
  purpose?: "ticket_order" | "activation";
  environment?: "simulation" | "sandbox";
  from?: string;
  to?: string;
}

interface CommerceRowBase {
  id: string;
  event_id: string;
  status: string;
  created_at: string;
  intent_id: string;
  order_id: string | null;
  activation_id: string | null;
  payer_user_id: string | null;
  purpose: "ticket_order" | "activation" | string;
  expected_minor: number;
  currency: string;
  environment: "simulation" | "sandbox" | string;
  simulated: boolean;
  provider: string;
  provider_payment_id: string | null;
  organization_id: string;
}

// One payment attempt (also used for the failed-payment list).
export interface AdminPaymentRow extends CommerceRowBase {
  charged_minor: number | null;
  processing_fee_minor: number | null;
  confirmed_at: string | null;
  next_reconcile_at: string | null;
}

// One logical full-refund obligation and its latest attempt.
export interface AdminRefundRow extends CommerceRowBase {
  payment_attempt_id: string;
  reason: string | null;
  amount_minor: number;
  succeeded_at: string | null;
  latest_attempt_status: string | null;
}

export interface AdminSearch {
  q?: string;
  status?: string;
  limit: number;
  offset: number;
}
