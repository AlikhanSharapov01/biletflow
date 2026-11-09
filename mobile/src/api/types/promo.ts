// backend/CAMPAIGNS_API.md and app/campaign_schemas.py.

export interface PromoPreview {
  event_id: string;
  code: string;
  discount_kind: "percent" | "fixed";
  // Percent (e.g. 10 for 10%) or KZT minor units for "fixed".
  discount_value: number;
  eligible_ticket_type_ids: string[];
  valid_until: string;
}

export interface CampaignLink {
  event_id: string;
  code: string;
}
