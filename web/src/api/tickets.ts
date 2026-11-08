import { request } from "./client";
import { requestBlob, type DownloadedFile } from "./files";
import type { EntryConfirmation, IssuedTicket, TicketAdmission, TicketDelivery } from "./types/checkout";

const id = encodeURIComponent;

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

// Claimed recipient only; 409 ticket_not_valid for refunded/cancelled tickets.
export function downloadTicketPdf(ticketId: string): Promise<DownloadedFile> {
  return requestBlob(`/api/v1/tickets/${id(ticketId)}/pdf`, `biletflow-ticket-${ticketId}.pdf`);
}

export function getDelivery(ticketId: string): Promise<TicketDelivery> {
  return request<TicketDelivery>(`/api/v1/tickets/${id(ticketId)}/delivery`);
}

// 429 resend_too_soon / resend_limit_reached / rate_limited.
export function resendDelivery(ticketId: string): Promise<TicketDelivery> {
  return request<TicketDelivery>(`/api/v1/tickets/${id(ticketId)}/delivery/resend`, { method: "POST" });
}

export function getAdmission(ticketId: string): Promise<TicketAdmission> {
  return request<TicketAdmission>(`/api/v1/tickets/${id(ticketId)}/admission`);
}

// Short-lived proof that the attendee is signed in now; a new request revokes
// the previous confirmation.
export function requestEntryConfirmation(ticketId: string): Promise<EntryConfirmation> {
  return request<EntryConfirmation>(`/api/v1/tickets/${id(ticketId)}/entry-confirmations`, { method: "POST" });
}
