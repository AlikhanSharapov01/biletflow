import { request } from "./http";
import { downloadFile } from "./files";
import type { PaidSalesChecklist } from "./types/paidSales";
import type {
  AdminActivationRow,
  AdminCampaignDetail,
  AdminCampaignRow,
  AdminDelivery,
  AdminEventRow,
  AdminJob,
  AdminMe,
  AdminOrderDetail,
  AdminSupportCaseDetail,
  AdminSupportCaseRow,
  AdminSyncConflictDetail,
  AdminSyncConflictRow,
  AdminOrderRow,
  AdminPaymentRow,
  AdminRefundRow,
  AdminSearch,
  AdminTicketRow,
  AdminUserRow,
  CommerceFilters,
  EventReport,
  ExportKind,
  ModerationAction,
  OpsFilters,
  Page,
  PlatformSetting,
  ReportStatus,
  SettingUpdate,
} from "./types/admin";

const id = encodeURIComponent;
const ADMIN = "/api/v1/admin";

// Platform administration (backend/ADMIN_API.md). Non-admins get 403
// admin_required on every call.

export function getAdminMe(): Promise<AdminMe> {
  return request<AdminMe>(`${ADMIN}/me`);
}

function search<T>(kind: string, params: AdminSearch & Record<string, string | number | undefined>): Promise<Page<T>> {
  return request<Page<T>>(`${ADMIN}/${kind}`, { query: { ...params, q: params.q?.trim() || undefined } });
}

export const searchUsers = (params: AdminSearch) => search<AdminUserRow>("users", { ...params });
export const searchOrders = (params: AdminSearch) => search<AdminOrderRow>("orders", { ...params });
export const searchTickets = (params: AdminSearch) => search<AdminTicketRow>("tickets", { ...params });

// Events filter on moderation_state rather than a generic status.
export function searchEvents({ status, ...params }: AdminSearch): Promise<Page<AdminEventRow>> {
  return search<AdminEventRow>("events", { ...params, moderation_state: status });
}

export function moderateUser(userId: string, action: "suspend" | "reinstate", reason: string): Promise<ModerationAction> {
  return request<ModerationAction>(`${ADMIN}/users/${id(userId)}/${action}`, { method: "POST", body: { reason } });
}

export function moderateEvent(eventId: string, action: "suspend" | "reinstate", reason: string): Promise<ModerationAction> {
  return request<ModerationAction>(`${ADMIN}/events/${id(eventId)}/${action}`, { method: "POST", body: { reason } });
}

// Paid-sales suspension (SRS 4.5): closes paid checkout for one event without
// cancelling, refunding or voiding anything already sold.
export function getEventPaidSales(eventId: string): Promise<PaidSalesChecklist> {
  return request<PaidSalesChecklist>(`${ADMIN}/events/${id(eventId)}/paid-sales`);
}

export function moderatePaidSales(eventId: string, action: "suspend" | "reinstate", reason: string, idempotencyKey: string): Promise<PaidSalesChecklist> {
  return request<PaidSalesChecklist>(`${ADMIN}/events/${id(eventId)}/paid-sales/${action}`, { method: "POST", body: { reason }, idempotencyKey });
}

// Commerce inspection (SRS 4.12): exact filters, no free-text search.
function commerce<T>(kind: string, filters: CommerceFilters, limit: number, offset: number): Promise<Page<T>> {
  return request<Page<T>>(`${ADMIN}/${kind}`, { query: { ...filters, limit, offset } });
}

export const searchPayments = (filters: CommerceFilters, limit: number, offset: number) => commerce<AdminPaymentRow>("payments", filters, limit, offset);
export const searchFailedPayments = (filters: CommerceFilters, limit: number, offset: number) =>
  commerce<AdminPaymentRow>("failed-payments", filters, limit, offset);
export const searchRefunds = (filters: CommerceFilters, limit: number, offset: number) => commerce<AdminRefundRow>("refunds", filters, limit, offset);

// Operational inspection (#72): read-only; looking never grants a role.
function inspect<T>(kind: string, filters: OpsFilters, limit: number, offset: number): Promise<Page<T>> {
  return request<Page<T>>(`${ADMIN}/${kind}`, { query: { ...filters, q: filters.q?.trim() || undefined, limit, offset } });
}

export const searchSupportCases = (filters: OpsFilters, limit: number, offset: number) =>
  inspect<AdminSupportCaseRow>("support-cases", filters, limit, offset);
export const searchActivations = (filters: OpsFilters, limit: number, offset: number) =>
  inspect<AdminActivationRow>("activations", { ...filters, q: undefined }, limit, offset);
export const searchCampaigns = (filters: OpsFilters, limit: number, offset: number) =>
  inspect<AdminCampaignRow>("campaigns", { ...filters, status: undefined }, limit, offset);
export const searchSyncConflicts = (filters: OpsFilters, limit: number, offset: number) =>
  inspect<AdminSyncConflictRow>("sync-conflicts", { ...filters, q: undefined }, limit, offset);

export function getSupportCaseDetail(caseId: string): Promise<AdminSupportCaseDetail> {
  return request<AdminSupportCaseDetail>(`${ADMIN}/support-cases/${id(caseId)}`);
}

export function getOrderDetail(orderId: string): Promise<AdminOrderDetail> {
  return request<AdminOrderDetail>(`${ADMIN}/orders/${id(orderId)}`);
}

export function getCampaignDetail(campaignId: string): Promise<AdminCampaignDetail> {
  return request<AdminCampaignDetail>(`${ADMIN}/campaigns/${id(campaignId)}`);
}

export function getSyncConflictDetail(conflictId: string): Promise<AdminSyncConflictDetail> {
  return request<AdminSyncConflictDetail>(`${ADMIN}/sync-conflicts/${id(conflictId)}`);
}

// Background work (#73): outbox jobs and notification deliveries. A retry
// sends one exhausted row back to the worker; a repeat with the same
// Idempotency-Key answers the current row without a second reset.
export const searchJobs = (filters: OpsFilters, limit: number, offset: number) =>
  inspect<AdminJob>("jobs", { ...filters, q: undefined }, limit, offset);
export const searchDeliveries = (filters: OpsFilters, limit: number, offset: number) =>
  inspect<AdminDelivery>("notification-deliveries", { ...filters, q: undefined }, limit, offset);

export function retryJob(jobId: string, reason: string, idempotencyKey: string): Promise<AdminJob> {
  return request<AdminJob>(`${ADMIN}/jobs/${id(jobId)}/retry`, { method: "POST", body: { reason }, idempotencyKey });
}

export function retryDelivery(deliveryId: string, reason: string, idempotencyKey: string): Promise<AdminDelivery> {
  return request<AdminDelivery>(`${ADMIN}/notification-deliveries/${id(deliveryId)}/retry`, { method: "POST", body: { reason }, idempotencyKey });
}

export function listModerationActions(limit: number, offset: number): Promise<ModerationAction[]> {
  return request<ModerationAction[]>(`${ADMIN}/moderation-actions`, { query: { limit, offset } });
}

export function listReports(status: ReportStatus | "", limit: number, offset: number): Promise<Page<EventReport>> {
  return request<Page<EventReport>>(`${ADMIN}/reports`, { query: { status: status || undefined, limit, offset } });
}

export function reviewReport(reportId: string): Promise<EventReport> {
  return request<EventReport>(`${ADMIN}/reports/${id(reportId)}/review`, { method: "POST" });
}

export function resolveReport(reportId: string, resolution: string): Promise<EventReport> {
  return request<EventReport>(`${ADMIN}/reports/${id(reportId)}/resolve`, { method: "POST", body: { resolution } });
}

export function listSettings(): Promise<PlatformSetting[]> {
  return request<PlatformSetting[]>(`${ADMIN}/settings`);
}

export function updateSetting(key: string, data: SettingUpdate): Promise<PlatformSetting> {
  return request<PlatformSetting>(`${ADMIN}/settings/${id(key)}`, { method: "PUT", body: data });
}

// Commerce kinds take CommerceFilters and refuse free-text `q` (422).
export function downloadExport(kind: ExportKind, filters: CommerceFilters & { q?: string; limit?: number }): Promise<void> {
  const { q, status, limit, ...commerceFilters } = filters;
  return downloadFile(`${ADMIN}/exports/${kind}.csv`, `${kind}.csv`, {
    ...commerceFilters,
    q: q?.trim() || undefined,
    status: status || undefined,
    limit,
  });
}
