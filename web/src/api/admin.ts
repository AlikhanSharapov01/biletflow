import { request } from "./client";
import { downloadFile } from "./files";
import { forgetPublicSettings } from "./settings";
import type { PaidSalesChecklist } from "./types/paidSales";
import type {
  AdminEventRow,
  AdminPaymentRow,
  AdminRefundRow,
  CommerceFilters,
  AdminMe,
  AdminOrderRow,
  AdminSearch,
  AdminTicketRow,
  AdminUserRow,
  EventReport,
  ExportKind,
  ModerationAction,
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
export const searchFailedPayments = (filters: CommerceFilters, limit: number, offset: number) => commerce<AdminPaymentRow>("failed-payments", filters, limit, offset);
export const searchRefunds = (filters: CommerceFilters, limit: number, offset: number) => commerce<AdminRefundRow>("refunds", filters, limit, offset);

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

export async function updateSetting(key: string, data: SettingUpdate): Promise<PlatformSetting> {
  const saved = await request<PlatformSetting>(`${ADMIN}/settings/${id(key)}`, { method: "PUT", body: data });
  forgetPublicSettings();
  return saved;
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
