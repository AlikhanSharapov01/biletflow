import { request } from "./http";
import type { EventSeat, SeatPage, SeatUpdate, VenueLayout, VenueLayoutDetail } from "./types/seating";

const id = encodeURIComponent;

// Predefined venue layouts and an event's assigned seats (backend/CATALOG_API.md).

export function listLayouts(venueId: string): Promise<VenueLayout[]> {
  return request<VenueLayout[]>(`/api/v1/venues/${id(venueId)}/layouts`);
}

export function getLayout(venueId: string, layoutId: string): Promise<VenueLayoutDetail> {
  return request<VenueLayoutDetail>(`/api/v1/venues/${id(venueId)}/layouts/${id(layoutId)}`);
}

// Maps every price category of the event's layout to one of its ticket types.
export function configureSeats(eventId: string, ticketTypes: Record<string, string>): Promise<{ configured_seats: number }> {
  return request<{ configured_seats: number }>(`/api/v1/events/${id(eventId)}/seats/configure`, {
    method: "POST",
    body: { ticket_types: ticketTypes },
  });
}

export function listSeats(eventId: string): Promise<SeatPage> {
  return request<SeatPage>(`/api/v1/events/${id(eventId)}/seats`, { query: { limit: 500 } });
}

export function updateSeat(eventId: string, seatId: string, data: SeatUpdate): Promise<EventSeat> {
  return request<EventSeat>(`/api/v1/events/${id(eventId)}/seats/${id(seatId)}`, { method: "PATCH", body: data });
}
