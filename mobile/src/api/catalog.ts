// Public event discovery — the calls the web Discover page makes
// (web/src/live.js loadDiscovery). Types mirror backend/app/catalog_schemas.py.

import { requestJson } from "@/api/session";
import type { CatalogEvent, Category, EventFilters, TicketType, Venue } from "@/api/types/catalog";

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
