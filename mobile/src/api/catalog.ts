// Public event discovery — the calls the web Discover page makes
// (web/src/live.js loadDiscovery). Types mirror backend/app/catalog_schemas.py.

import { requestJson } from "@/api/session";

export type Category = {
  id: string;
  code: string;
  name_kk: string;
  name_ru: string;
  name_en: string;
};

export type Venue = {
  id: string;
  name: string;
  address: string;
  city: string;
  country_code: string;
};

export type CatalogEvent = {
  id: string;
  organization_id: string;
  category_id: string;
  venue_id: string;
  title: string;
  description: string;
  visibility: "public" | "unlisted" | "private";
  capacity: number;
  starts_at: string;
  ends_at: string;
  time_zone: string;
  publication_state: string;
  time_status: string;
};

export type TicketType = {
  id: string;
  event_id: string;
  name: string;
  description: string;
  kind: "free" | "paid";
  price_minor: number;
  is_hidden: boolean;
};

export type EventFilters = {
  q: string;
  categoryId: string;
};

export function listEvents(filters: EventFilters): Promise<CatalogEvent[]> {
  const params = new URLSearchParams({ limit: "50" });
  if (filters.q) params.set("q", filters.q);
  if (filters.categoryId) params.set("category_id", filters.categoryId);
  return requestJson<CatalogEvent[]>(`/events?${params}`);
}

export function listCategories(): Promise<Category[]> {
  return requestJson<Category[]>("/categories");
}

export function listVenues(): Promise<Venue[]> {
  return requestJson<Venue[]>("/venues");
}

export function getEvent(id: string): Promise<CatalogEvent> {
  return requestJson<CatalogEvent>(`/events/${encodeURIComponent(id)}`);
}

export function listTicketTypes(eventId: string): Promise<TicketType[]> {
  return requestJson<TicketType[]>(`/events/${encodeURIComponent(eventId)}/ticket-types`);
}
