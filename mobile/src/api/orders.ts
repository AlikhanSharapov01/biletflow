import { request } from "./http";
import type { Order } from "./types/checkout";
import type { CancelRegistrationInput, RefundRequestInput, RefundRequested } from "./types/payments";

const id = encodeURIComponent;

export function listOrders(): Promise<Order[]> {
  return request<Order[]>("/api/v1/orders");
}

export function getOrder(orderId: string): Promise<Order> {
  return request<Order>(`/api/v1/orders/${id(orderId)}`);
}

// Opens an organizer support case; does not start the refund itself.
export function requestRefund(orderId: string, input: RefundRequestInput): Promise<RefundRequested> {
  return request<RefundRequested>(`/api/v1/orders/${id(orderId)}/refund-requests`, { method: "POST", body: input });
}

// Attendee cancellation of a free registration.
export function cancelRegistration(orderId: string, input: CancelRegistrationInput): Promise<Order> {
  return request<Order>(`/api/v1/orders/${id(orderId)}/cancel`, { method: "POST", body: input });
}
