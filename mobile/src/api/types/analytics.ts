// backend/ANALYTICS_API.md and app/analytics_schemas.py: read-only event
// analytics. Money is KZT minor units; buckets are in the event's time zone.

export interface AnalyticsFilters {
  from?: string;
  to?: string;
  ticket_type_id?: string;
  campaign_id?: string;
}

export interface AnalyticsMetadata {
  event_id: string;
  timezone: string;
  generated_at: string;
  filters: { from: string | null; to: string | null; ticket_type_id: string | null; campaign_id: string | null };
  definitions: Record<string, string>;
}

export interface EventAnalytics extends AnalyticsMetadata {
  inventory: {
    capacity: number;
    sold: number;
    held: number;
    expired_held: number;
    available: number;
    blocked: number;
    refund_pending: number;
    sold_percentage: number;
  };
  revenue: {
    currency: "KZT";
    environments: Array<"simulation" | "sandbox">;
    simulated: boolean;
    gross_minor: number;
    discount_minor: number;
    fulfilled_collected_minor: number;
    collected_minor: number;
    charged_fees_minor: number;
    fee_reversals_minor: number;
    fees_minor: number;
    refunds_minor: number;
    pending_refunds_minor: number;
    net_minor: number;
  };
  attendance: {
    issued: number;
    checked_in: number;
    not_checked_in: number;
    not_checked_in_label: "absent" | "not_yet_checked_in";
    percentage: number;
  };
  by_ticket_type: Array<{
    ticket_type_id: string;
    name: string;
    capacity: number;
    sold: number;
    checked_in: number;
    revenue_minor: number;
  }>;
  // campaign_id is null for sales no campaign applies to ("Unattributed").
  by_campaign: Array<{
    campaign_id: string | null;
    name: string;
    redemptions: number;
    original_tickets: number;
    refunded_tickets: number;
    retained_tickets: number;
    discount_minor: number;
    revenue_minor: number;
    collected_minor: number;
    refunds_minor: number;
    pending_refunds_minor: number;
    fees_minor: number;
  }>;
}

export type SeriesBucket = "day" | "hour";

export interface SalesPoint {
  bucket_start: string;
  tickets: number;
  revenue_minor: number;
}

export interface SalesSeries extends AnalyticsMetadata {
  bucket: SeriesBucket;
  points: SalesPoint[];
}
