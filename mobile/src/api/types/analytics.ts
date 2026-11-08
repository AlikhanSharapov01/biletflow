// PLANNED contract (plan section 3): read-only event analytics. Money is KZT
// minor units; buckets are in the event's time zone.

export interface AnalyticsFilters {
  from?: string;
  to?: string;
  ticket_type_id?: string;
  campaign_id?: string;
}

export interface EventAnalytics {
  event_id: string;
  timezone: string;
  generated_at: string;
  inventory: { capacity: number; sold: number; held: number; available: number };
  revenue: { gross_minor: number; discount_minor: number; fees_minor: number; refunds_minor: number; net_minor: number };
  attendance: { issued: number; checked_in: number };
  by_ticket_type: Array<{
    ticket_type_id: string;
    name: string;
    capacity: number;
    sold: number;
    checked_in: number;
    revenue_minor: number;
  }>;
  by_campaign: Array<{
    campaign_id: string;
    name: string;
    redemptions: number;
    discount_minor: number;
    revenue_minor: number;
  }>;
}

export type SeriesBucket = "day" | "hour";

export interface SalesPoint {
  bucket_start: string;
  tickets: number;
  revenue_minor: number;
}

export interface SalesSeries {
  event_id: string;
  bucket: SeriesBucket;
  timezone: string;
  points: SalesPoint[];
}
