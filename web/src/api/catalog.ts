import { request } from "./client";
import type {
  Category,
  EventCapability,
  EventFilters,
  EventInput,
  EventView,
  HistoryEntry,
  Invitation,
  MemberDetail,
  Organization,
  OrganizationCreate,
  StaffAssignment,
  TicketType,
  TicketTypeInput,
  Venue,
} from "./types";

const id = encodeURIComponent;

// ---------------------------------------------------------------- discovery

export function listCategories(): Promise<Category[]> {
  return request<Category[]>("/api/v1/categories");
}

export function listVenues(): Promise<Venue[]> {
  return request<Venue[]>("/api/v1/venues");
}

export function listEvents(filters: EventFilters = {}): Promise<EventView[]> {
  return request<EventView[]>("/api/v1/events", {
    query: { q: filters.q, category_id: filters.category_id, limit: filters.limit ?? 50 },
  });
}

export function getEvent(eventId: string): Promise<EventView> {
  return request<EventView>(`/api/v1/events/${id(eventId)}`);
}

export function listTicketTypes(eventId: string): Promise<TicketType[]> {
  return request<TicketType[]>(`/api/v1/events/${id(eventId)}/ticket-types`);
}

// ------------------------------------------------------------- organizations

export function listOrganizations(): Promise<Organization[]> {
  return request<Organization[]>("/api/v1/organizations");
}

export function createOrganization(data: OrganizationCreate): Promise<Organization> {
  return request<Organization>("/api/v1/organizations", { method: "POST", body: data });
}

export function listMembers(organizationId: string): Promise<MemberDetail[]> {
  return request<MemberDetail[]>(`/api/v1/organizations/${id(organizationId)}/members`, { query: { limit: 100 } });
}

export function revokeMember(organizationId: string, memberId: string): Promise<unknown> {
  return request(`/api/v1/organizations/${id(organizationId)}/members/${id(memberId)}`, { method: "DELETE" });
}

export function listInvitations(organizationId: string): Promise<Invitation[]> {
  return request<Invitation[]>(`/api/v1/organizations/${id(organizationId)}/invitations`, { query: { limit: 100 } });
}

export function inviteMember(organizationId: string, email: string): Promise<Invitation> {
  return request<Invitation>(`/api/v1/organizations/${id(organizationId)}/invitations`, {
    method: "POST",
    body: { email },
  });
}

export function revokeInvitation(organizationId: string, invitationId: string): Promise<unknown> {
  return request(`/api/v1/organizations/${id(organizationId)}/invitations/${id(invitationId)}`, { method: "DELETE" });
}

export function acceptInvitation(token: string): Promise<unknown> {
  return request("/api/v1/staff-invitations/accept", { method: "POST", body: { token } });
}

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
