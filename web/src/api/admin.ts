import { request } from "./client";
import { downloadFile } from "./files";
import type {
  AdminEventRow,
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

export function downloadExport(kind: ExportKind, filters: { q?: string; status?: string; limit?: number }): Promise<void> {
  return downloadFile(`${ADMIN}/exports/${kind}.csv`, `${kind}.csv`, {
    q: filters.q?.trim() || undefined,
    status: filters.status || undefined,
    limit: filters.limit,
  });
}
