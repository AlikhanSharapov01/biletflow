import { request } from "./http";
import { downloadFile } from "./files";
import type { CheckInFilters, CheckInRecord, ConflictResolution, Page, SyncConflict } from "./types/admission";
import { localInputToIso } from "@/utils/format";

const id = encodeURIComponent;

// Organizer check-in log, its CSV export and the offline conflict review.

export function checkInQuery(filters: CheckInFilters): Record<string, string | undefined> {
  const q = filters.q?.trim();
  return {
    from: filters.from ? (localInputToIso(filters.from) ?? undefined) : undefined,
    to: filters.to ? (localInputToIso(filters.to) ?? undefined) : undefined,
    source: filters.source || undefined,
    state: filters.state || undefined,
    ticket_type_id: filters.ticket_type_id || undefined,
    q: q && q.length >= 2 ? q : undefined,
  };
}

export function listCheckIns(eventId: string, filters: CheckInFilters, limit: number, offset: number): Promise<Page<CheckInRecord>> {
  return request<Page<CheckInRecord>>(`/api/v1/events/${id(eventId)}/check-ins`, {
    query: { ...checkInQuery(filters), limit, offset },
  });
}

export function downloadCheckInsCsv(eventId: string, filters: CheckInFilters): Promise<void> {
  return downloadFile(`/api/v1/events/${id(eventId)}/check-ins.csv`, `check-ins-${eventId}.csv`, checkInQuery(filters));
}

export function listSyncConflicts(eventId: string, status: "open" | "resolved"): Promise<SyncConflict[]> {
  return request<SyncConflict[]>(`/api/v1/events/${id(eventId)}/sync-conflicts`, { query: { status, limit: 100 } });
}

export function resolveSyncConflict(conflictId: string, data: ConflictResolution): Promise<SyncConflict & { reversed_check_in_id: string | null }> {
  return request(`/api/v1/sync-conflicts/${id(conflictId)}/resolve`, { method: "POST", body: data });
}
