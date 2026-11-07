import { request } from "./client";
import type { Order } from "./types/checkout";
import type { CancelRegistrationInput, RefundRequestInput } from "./types/payments";

const id = encodeURIComponent;

export function listOrders(): Promise<Order[]> {
  return request<Order[]>("/api/v1/orders");
}

export function getOrder(orderId: string): Promise<Order> {
  return request<Order>(`/api/v1/orders/${id(orderId)}`);
}

// Planned contract (B4): voluntary refund of a paid order.
export function requestRefund(orderId: string, input: RefundRequestInput): Promise<unknown> {
  return request(`/api/v1/orders/${id(orderId)}/refund-requests`, { method: "POST", body: input });
}

// Planned contract (B4): attendee cancellation of a free registration.
export function cancelRegistration(orderId: string, input: CancelRegistrationInput): Promise<Order> {
  return request<Order>(`/api/v1/orders/${id(orderId)}/cancel`, { method: "POST", body: input });
}
