import { request } from "./client";
import { uploadFile } from "./files";
import type { RefundStarted, TicketCancelled } from "./types/payments";
import type {
  Attendee,
  EventCapability,
  EventInput,
  EventView,
  HistoryEntry,
  StaffAssignment,
  TicketType,
  TicketTypeInput,
} from "./types";

const id = encodeURIComponent;

// Organizer-side event management: drafts, publication, ticket types, staff,
// attendees and the activity history.

// ------------------------------------------------------------------- events

export function listOrganizationEvents(organizationId: string): Promise<EventView[]> {
  return request<EventView[]>(`/api/v1/organizations/${id(organizationId)}/events`);
}

export function createEvent(organizationId: string, data: EventInput): Promise<EventView> {
  return request<EventView>(`/api/v1/organizations/${id(organizationId)}/events`, {
    method: "POST",
    body: data,
  });
}

export function updateEvent(eventId: string, data: EventInput): Promise<EventView> {
  return request<EventView>(`/api/v1/events/${id(eventId)}`, { method: "PUT", body: data });
}

export function publishEvent(eventId: string): Promise<EventView> {
  return request<EventView>(`/api/v1/events/${id(eventId)}/publish`, { method: "POST" });
}

export function unpublishEvent(eventId: string): Promise<EventView> {
  return request<EventView>(`/api/v1/events/${id(eventId)}/unpublish`, { method: "POST" });
}

export function cancelEvent(eventId: string): Promise<EventView> {
  return request<EventView>(`/api/v1/events/${id(eventId)}/cancel`, { method: "POST" });
}

export function duplicateEvent(eventId: string): Promise<EventView> {
  return request<EventView>(`/api/v1/events/${id(eventId)}/duplicate`, { method: "POST" });
}

export function listHistory(eventId: string): Promise<HistoryEntry[]> {
  return request<HistoryEntry[]>(`/api/v1/events/${id(eventId)}/history`, { query: { limit: 100 } });
}

// ------------------------------------------------------------- ticket types

export function createTicketType(eventId: string, data: TicketTypeInput): Promise<TicketType> {
  return request<TicketType>(`/api/v1/events/${id(eventId)}/ticket-types`, { method: "POST", body: data });
}

export function updateTicketType(eventId: string, typeId: string, data: TicketTypeInput): Promise<TicketType> {
  return request<TicketType>(`/api/v1/events/${id(eventId)}/ticket-types/${id(typeId)}`, {
    method: "PUT",
    body: data,
  });
}

// -------------------------------------------------------------------- staff

export function listStaff(eventId: string): Promise<StaffAssignment[]> {
  return request<StaffAssignment[]>(`/api/v1/events/${id(eventId)}/staff`, { query: { limit: 100 } });
}

export function assignStaff(eventId: string, memberId: string, capabilities: EventCapability[]): Promise<StaffAssignment> {
  return request<StaffAssignment>(`/api/v1/events/${id(eventId)}/staff`, {
    method: "PUT",
    body: { member_id: memberId, capabilities },
  });
}

export function revokeStaff(eventId: string, staffId: string): Promise<unknown> {
  return request(`/api/v1/events/${id(eventId)}/staff/${id(staffId)}`, { method: "DELETE" });
}

// ---------------------------------------------------------------- attendees

export function listAttendees(eventId: string): Promise<Attendee[]> {
  return request<Attendee[]>(`/api/v1/events/${id(eventId)}/attendees`, { query: { limit: 100 } });
}

// -------------------------------------------- refunds and cancellation
// Confirmed in backend/REFUNDS_API.md.

export function cancelTicket(eventId: string, ticketId: string, reason: string): Promise<TicketCancelled> {
  return request<TicketCancelled>(`/api/v1/events/${id(eventId)}/tickets/${id(ticketId)}/cancel`, { method: "POST", body: { reason } });
}

export function refundOrder(orderId: string, reason: string): Promise<RefundStarted> {
  return request<RefundStarted>(`/api/v1/orders/${id(orderId)}/refunds`, { method: "POST", body: { reason } });
}

export interface EventImage {
  id: string;
  url: string;
  mime_type: string;
  size_bytes: number;
}

export function uploadEventImage(eventId: string, file: File): Promise<EventImage> {
  return uploadFile<EventImage>(`/api/v1/events/${id(eventId)}/images`, file, { filename: file.name });
}
