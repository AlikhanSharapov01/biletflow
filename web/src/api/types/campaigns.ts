// backend/CAMPAIGNS_API.md and app/campaign_schemas.py.

export type DiscountKind = "percent" | "fixed";

export interface CampaignInput {
  name: string;
  discount_kind: DiscountKind;
  // Whole percent (1-100) for "percent", KZT minor units for "fixed".
  value: number;
  starts_at: string;
  ends_at: string;
  max_redemptions: number | null;
  // Empty means every ticket type is eligible.
  eligible_ticket_type_ids: string[];
  code: string | null;
}

export interface Campaign extends Omit<CampaignInput, "code"> {
  id: string;
  event_id: string;
  created_at: string;
  code: string;
  status: "scheduled" | "active" | "ended" | "disabled";
  redemptions_used: number;
  // Public promo link (/c/{token}); never an admission ticket.
  link_url: string;
}

export interface CampaignReport {
  campaign_id: string;
  redemptions: number;
  orders: number;
  tickets: number;
  tickets_refunded: number;
  tickets_kept: number;
  gross_minor: number;
  discount_minor: number;
  collected_minor: number;
  refunds_minor: number;
  fees_minor: number;
  net_minor: number;
  generated_at: string;
}
