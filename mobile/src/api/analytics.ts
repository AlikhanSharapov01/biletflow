import { request } from "./http";
import type { AnalyticsFilters, EventAnalytics, SalesSeries, SeriesBucket } from "./types/analytics";
import { localInputToIso } from "@/utils/format";

const id = encodeURIComponent;

// PLANNED contract: event analytics (needs the `reports` capability).

function query(filters: AnalyticsFilters): Record<string, string | undefined> {
  return {
    from: filters.from ? (localInputToIso(filters.from) ?? undefined) : undefined,
    to: filters.to ? (localInputToIso(filters.to) ?? undefined) : undefined,
    ticket_type_id: filters.ticket_type_id || undefined,
    campaign_id: filters.campaign_id || undefined,
  };
}

export function getAnalytics(eventId: string, filters: AnalyticsFilters): Promise<EventAnalytics> {
  return request<EventAnalytics>(`/api/v1/events/${id(eventId)}/analytics`, { query: query(filters) });
}

export function getSalesSeries(eventId: string, filters: AnalyticsFilters, bucket: SeriesBucket): Promise<SalesSeries> {
  return request<SalesSeries>(`/api/v1/events/${id(eventId)}/analytics/sales-series`, {
    query: { ...query(filters), bucket },
  });
}
