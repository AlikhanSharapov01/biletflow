import { request } from "./http";

// POST /events/{id}/reports (backend/ADMIN_API.md, "Event reports").
export type ReportCategory = "spam" | "fraud" | "inappropriate" | "misleading" | "safety" | "other";

export interface ReportInput {
  category: ReportCategory;
  description: string;
}

export interface ReporterReceipt {
  id: string;
  event_id: string;
  category: ReportCategory | string;
  status: string;
  created_at: string;
  // True when an open report for this event and category already existed.
  duplicate: boolean;
}

export function reportEvent(eventId: string, input: ReportInput): Promise<ReporterReceipt> {
  return request<ReporterReceipt>(`/api/v1/events/${encodeURIComponent(eventId)}/reports`, { method: "POST", body: input });
}
