// Mirrors backend/app/analytics_schemas.py (contract: backend/ANALYTICS_API.md).
// Read-only event analytics; money is integer 1/100 KZT and buckets are in
// the event's time zone. Every figure is computed by the server.

export interface AnalyticsFilters {
  from?: string;
  to?: string;
  ticket_type_id?: string;
  campaign_id?: string;
}

export interface AppliedFilters {
  from: string | null;
  to: string | null;
  ticket_type_id: string | null;
  campaign_id: string | null;
}

interface AnalyticsMetadata {
  event_id: string;
  timezone: string;
  generated_at: string;
  filters: AppliedFilters;
  // Metric name -> the server's own definition text.
  definitions: Record<string, string>;
}

export type PaymentEnvironment = "simulation" | "sandbox";

export interface InventoryMetrics {
  capacity: number;
  sold: number;
  held: number;
  expired_held: number;
  available: number;
  blocked: number;
  refund_pending: number;
  sold_percentage: number;
}

export interface RevenueMetrics {
  currency: string;
  environments: PaymentEnvironment[];
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
}

export interface AttendanceMetrics {
  issued: number;
  checked_in: number;
  not_checked_in: number;
  // "absent" once the event has ended, "not_yet_checked_in" before.
  not_checked_in_label: "absent" | "not_yet_checked_in";
  percentage: number;
}

export interface TicketTypeMetrics {
  ticket_type_id: string;
  name: string;
  capacity: number;
  sold: number;
  checked_in: number;
  revenue_minor: number;
}

export interface CampaignMetrics {
  // null groups the sales no campaign applies to ("Unattributed").
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
}

export interface EventAnalytics extends AnalyticsMetadata {
  inventory: InventoryMetrics;
  revenue: RevenueMetrics;
  attendance: AttendanceMetrics;
  by_ticket_type: TicketTypeMetrics[];
  by_campaign: CampaignMetrics[];
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
