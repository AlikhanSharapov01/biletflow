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

// ---- GA4 (ANALYTICS_API.md "GA4 traffic and funnel integration", #71/#131).
// Optional and off by default. Measurements are traffic signals of consenting
// signed-in people only; they are never sales, which stay in the reports above.

export type MeasurementName = "campaign_landing" | "event_view" | "checkout_start";

export interface Measurement {
  name: MeasurementName;
  analytics_event_id: string;
  event_id: string;
  campaign_id?: string;
  platform: "web";
  page_path?: string;
}

export interface MeasurementResult {
  status: "accepted" | "duplicate" | "skipped";
  reason: "disabled" | "consent_required" | "not_connected" | "backlog_full" | null;
}

export type TrafficState = "disabled" | "not_connected" | "fresh" | "stale" | "unavailable" | "error";

export interface TrafficReport {
  event_id: string;
  source: "ga4";
  state: TrafficState;
  error: "ga4_unavailable" | "ga4_error" | null;
  timezone: string;
  range: { from: string; to: string };
  fetched_at: string | null;
  expires_at: string | null;
  // Every measurement name -> GA4 counts; null (never zeros) unless fresh or stale.
  metrics: Record<string, { event_count: number; users: number }> | null;
  definitions: Record<string, string>;
}

// The organization's switch to the platform's GA4 property (owner only).
export interface Ga4Connection {
  organization_id: string;
  property_id: string | null;
  is_enabled: boolean;
  enabled_at: string | null;
  // "disabled": GA4 is off for the whole platform, so nothing can be connected.
  integration: "enabled" | "disabled";
}
