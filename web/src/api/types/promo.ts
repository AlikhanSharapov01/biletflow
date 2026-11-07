// Planned contract (commerce B5): promo previews and campaign QR links. The
// backend does not serve these yet; callers handle isNotImplemented().

export interface PromoPreview {
  event_id: string;
  code: string;
  discount_kind: "percent" | "fixed";
  // Percent (e.g. 10 for 10%) or KZT minor units for "fixed".
  discount_value: number;
  eligible_ticket_type_ids: string[];
  valid_until: string | null;
}

export interface CampaignLink {
  event_id: string;
  code: string | null;
}
