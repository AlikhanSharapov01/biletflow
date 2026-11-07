import { request } from "./client";
import type { Order } from "./types/checkout";
import type { SimulatedOutcome, SimulatedPaymentResult } from "./types/payments";

const id = encodeURIComponent;

// Demonstration only: acts as the payment provider for the caller's own
// attempt. The backend answers 404 outside development/test environments.
export function simulatePayment(attemptId: string, outcome: SimulatedOutcome): Promise<SimulatedPaymentResult> {
  return request<SimulatedPaymentResult>(`/api/v1/simulator/payments/${id(attemptId)}/events`, {
    method: "POST",
    body: { outcome },
  });
}

// New attempt after a failed one; an open attempt is returned instead.
// 409 quote_expired once the hold has lapsed.
export function retryPayment(orderId: string): Promise<Order> {
  return request<Order>(`/api/v1/orders/${id(orderId)}/payment-attempts`, { method: "POST" });
}
