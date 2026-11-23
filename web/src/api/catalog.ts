import { request } from "./client";
import type { Category, EventFilters, EventView, TicketType, Venue } from "./types";

const id = encodeURIComponent;

// Public discovery: anyone can read categories, venues, published events and
// their ticket types.

export function listCategories(): Promise<Category[]> {
  return request<Category[]>("/api/v1/categories");
}

export function listVenues(): Promise<Venue[]> {
  return request<Venue[]>("/api/v1/venues");
}

export function listEvents(filters: EventFilters = {}): Promise<EventView[]> {
  return request<EventView[]>("/api/v1/events", {
    query: {
      q: filters.q,
      category_id: filters.category_id,
      city: filters.city,
      date_from: filters.date_from,
      date_to: filters.date_to,
      ends_after: filters.ends_after,
      min_price: filters.min_price,
      max_price: filters.max_price,
      free: filters.free ? "true" : undefined,
      limit: filters.limit ?? 50,
      offset: filters.offset,
    },
  });
}

export function getEvent(eventId: string): Promise<EventView> {
  return request<EventView>(`/api/v1/events/${id(eventId)}`);
}

export function listTicketTypes(eventId: string): Promise<TicketType[]> {
  return request<TicketType[]>(`/api/v1/events/${id(eventId)}/ticket-types`);
}
