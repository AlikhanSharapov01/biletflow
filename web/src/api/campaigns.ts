import { request } from "./client";
import { fetchBlob } from "./files";
import type { Campaign, CampaignInput, CampaignReport } from "./types/campaigns";

const id = encodeURIComponent;

// PLANNED contract: promo campaigns per event (plan section 3).

function base(eventId: string): string {
  return `/api/v1/events/${id(eventId)}/campaigns`;
}

export function listCampaigns(eventId: string): Promise<Campaign[]> {
  return request<Campaign[]>(base(eventId));
}

export function createCampaign(eventId: string, data: CampaignInput): Promise<Campaign> {
  return request<Campaign>(base(eventId), { method: "POST", body: data });
}

export function updateCampaign(eventId: string, campaignId: string, data: CampaignInput): Promise<Campaign> {
  return request<Campaign>(`${base(eventId)}/${id(campaignId)}`, { method: "PUT", body: data });
}

export function disableCampaign(eventId: string, campaignId: string): Promise<Campaign> {
  return request<Campaign>(`${base(eventId)}/${id(campaignId)}/disable`, { method: "POST" });
}

export function getCampaignReport(eventId: string, campaignId: string): Promise<CampaignReport> {
  return request<CampaignReport>(`${base(eventId)}/${id(campaignId)}/report`);
}

// Server-rendered QR for the promo link, labelled "not an entry ticket".
export function fetchCampaignQr(eventId: string, campaignId: string): Promise<Blob> {
  return fetchBlob(`${base(eventId)}/${id(campaignId)}/qr.svg`);
}
