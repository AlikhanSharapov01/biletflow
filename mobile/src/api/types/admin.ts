// Mirrors backend/app/admin_schemas.py and the search columns in
// admin_service.py (backend/ADMIN_API.md).
import type { Page, SyncConflict } from "./admission";
import type { CampaignReport } from "./campaigns";
import type { Order } from "./checkout";

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

// ---- Operational inspection and background work (ADMIN_API.md, #72/#73).
// Read-only views; only jobs and deliveries have an action (retry).

export type InspectKind = "support-cases" | "activations" | "campaigns" | "sync-conflicts";
export type WorkKind = "jobs" | "notification-deliveries";

// The filters the app offers; each view ignores what it does not take.
export interface OpsFilters {
  q?: string;
  status?: string;
  event_id?: string;
}

export interface AdminSupportCaseRow {
  id: string;
  kind: "attendee" | "organizer_platform";
  category: string;
  subject: string;
  status: string;
  requester_user_id: string;
  organization_id: string | null;
  event_id: string | null;
  order_id: string | null;
  ticket_id: string | null;
  assigned_to_user_id: string | null;
  escalated_at: string | null;
  resolved_at: string | null;
  last_seq: number;
  created_at: string;
  updated_at: string;
  platform_access: boolean;
}

export interface AdminCaseChange {
  seq: number;
  change_kind: string;
  before_value: string | null;
  after_value: string | null;
  reason: string | null;
  actor_user_id: string | null;
  created_at: string;
}

export interface AdminSupportCaseDetail {
  case: AdminSupportCaseRow;
  viewer_roles: string[];
  message_count: number;
  history: AdminCaseChange[];
  order: { id: string; status: string } | null;
  ticket: { id: string; status: string } | null;
}

export interface AdminOrderDetail {
  order: Order;
  support_cases: Array<{ id: string; kind: string; category: string; status: string; escalated_at: string | null; created_at: string }>;
  deliveries: Array<{ id: string; ticket_id: string | null; status: string; attempt_count: number; last_error: string | null; created_at: string; completed_at: string | null }>;
  audit: Array<{ id: string; action: string; entity_type: string; entity_id: string; actor_user_id: string | null; service_actor: string | null; created_at: string }>;
}

export interface AdminActivationRow {
  id: string;
  event_id: string;
  event_title: string;
  organization_id: string;
  status: string;
  activation_fee_minor: number;
  currency: string;
  paid_attempt_id: string | null;
  activated_at: string | null;
  suspension_reason: string | null;
  created_at: string;
}

export interface AdminCampaignRow {
  id: string;
  event_id: string;
  organization_id: string;
  name: string;
  discount_kind: "percentage" | "fixed";
  percentage_bps: number | null;
  fixed_minor: number | null;
  starts_at: string;
  ends_at: string;
  max_redemptions: number | null;
  is_enabled: boolean;
  created_at: string;
  redemptions: number;
  active_reservations: number;
}

export interface AdminCampaignDetail {
  campaign: AdminCampaignRow;
  code: string | null;
  report: CampaignReport;
  redemptions: Array<{ order_id: string; discount_minor: number; created_at: string }>;
  reservations: Record<string, number>;
}

export interface AdminSyncConflictRow {
  id: string;
  status: "open" | "resolved";
  reason: string;
  event_id: string;
  organization_id: string;
  ticket_id: string | null;
  offline_operation_id: string;
  operation_kind: string;
  device_id: string;
  existing_check_in_id: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by_user_id: string | null;
}

export type AdminSyncConflictDetail = SyncConflict & { organization_id: string };

export interface AdminJob {
  id: string;
  kind: string;
  status: "pending" | "leased" | "done" | "dead";
  attempt_count: number;
  max_attempts: number | null;
  admin_retry_count: number;
  last_error: string | null;
  available_at: string;
  lease_until: string | null;
  created_at: string;
  completed_at: string | null;
  event_id: string | null;
  context: Record<string, string | number>;
  retryable: boolean;
}

export interface AdminDelivery {
  id: string;
  notification_id: string;
  kind: string;
  channel: "in_app" | "email";
  status: "pending" | "sent" | "failed";
  attempt_count: number;
  max_attempts: number | null;
  admin_retry_count: number;
  last_error: string | null;
  next_attempt_at: string | null;
  sent_at: string | null;
  provider_message_id: string | null;
  created_at: string;
  recipient_user_id: string;
  event_id: string | null;
  // `id` is null for account notices (they point at no record).
  target: { type: string; id: string | null } | null;
  retryable: boolean;
}
