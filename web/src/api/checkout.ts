import { request } from "./client";
import type { Attendee, Hold, HoldLine, IssuedTicket, Order, RecipientInput } from "./types";

const id = encodeURIComponent;

// Reserves inventory for ten minutes. A new hold on the same event replaces
// the buyer's earlier active hold.
export function createHold(eventId: string, items: HoldLine[]): Promise<Hold> {
  return request<Hold>(`/api/v1/events/${id(eventId)}/holds`, { method: "POST", body: { items } });
}

export function getHold(holdId: string): Promise<Hold> {
  return request<Hold>(`/api/v1/holds/${id(holdId)}`);
}

export function releaseHold(holdId: string): Promise<unknown> {
  return request(`/api/v1/holds/${id(holdId)}`, { method: "DELETE" });
}

// One recipient per allocation; issues the tickets and the delivery emails.
export function confirmHold(holdId: string, recipients: RecipientInput[]): Promise<Order> {
  return request<Order>(`/api/v1/holds/${id(holdId)}/confirm`, { method: "POST", body: { recipients } });
}

export function listOrders(): Promise<Order[]> {
  return request<Order[]>("/api/v1/orders");
}

export function getOrder(orderId: string): Promise<Order> {
  return request<Order>(`/api/v1/orders/${id(orderId)}`);
}

// Links tickets addressed to the caller's verified email. Call before listing.
export function claimTickets(): Promise<{ claimed: number }> {
  return request<{ claimed: number }>("/api/v1/tickets/claim", { method: "POST" });
}

export function listTickets(): Promise<IssuedTicket[]> {
  return request<IssuedTicket[]>("/api/v1/tickets");
}

export function getTicket(ticketId: string): Promise<IssuedTicket> {
  return request<IssuedTicket>(`/api/v1/tickets/${id(ticketId)}`);
}

export function listAttendees(eventId: string): Promise<Attendee[]> {
  return request<Attendee[]>(`/api/v1/events/${id(eventId)}/attendees`, { query: { limit: 100 } });
}
