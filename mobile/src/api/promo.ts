import { request } from "./http";
import type { CampaignLink, PromoPreview } from "./types/promo";

const id = encodeURIComponent;

// Confirmed in backend/CAMPAIGNS_API.md.
export function previewPromo(eventId: string, code: string): Promise<PromoPreview> {
  return request<PromoPreview>(`/api/v1/events/${id(eventId)}/promo-codes/${id(code)}/preview`);
}

// Resolves a campaign QR/link token to its event and code.
export function resolveCampaignLink(token: string): Promise<CampaignLink> {
  return request<CampaignLink>(`/api/v1/campaign-links/${id(token)}`);
}
