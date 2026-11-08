import type { Order } from "@/api/types/checkout";
import type { StatusTone } from "@/utils/status";

// Same rules as the web's checkout/utils/payment.ts: where a paid order
// stands, from the order status and its latest (simulated) attempt.
export type PaymentStage = "free" | "awaiting" | "processing" | "failed" | "confirmed" | "closed";

export function paymentStage(order: Order): PaymentStage {
  if (order.status === "confirmed") return order.payment ? "confirmed" : "free";
  if (order.status !== "pending") return "closed";
  const status = order.payment?.status;
  // created/pending: the (simulated) provider is waiting for the buyer.
  if (!status || status === "created" || status === "pending") return "awaiting";
  if (status === "failed") return "failed";
  // succeeded but not yet fulfilled, or unknown: wait for the server.
  return "processing";
}

const PAYMENT_LABEL: Record<string, string> = {
  created: "Awaiting payment",
  pending: "Payment pending",
  succeeded: "Paid",
  failed: "Payment failed",
  unknown: "Payment being checked",
};

export function paymentLabel(order: Order): string {
  if (!order.payment) return order.payable_minor > 0 ? "No payment yet" : "No payment needed";
  return PAYMENT_LABEL[order.payment.status] ?? order.payment.status.replace(/_/g, " ");
}

export function paymentTone(order: Order): StatusTone {
  const status = order.payment?.status;
  if (status === "succeeded") return "positive";
  if (status === "failed") return "blocked";
  if (!status) return "neutral";
  return "pending";
}

export function orderStatusTone(status: string): StatusTone {
  if (status === "confirmed") return "positive";
  if (status === "pending") return "pending";
  if (status === "expired" || status === "cancelled") return "neutral";
  return "blocked";
}

// Polling stops when the order settles or after this many tries.
export const POLL_INTERVAL_MS = 2000;
export const POLL_LIMIT = 10;

// Orders carry their event only through the issued tickets.
export function orderTitle(order: Order): string {
  return order.items[0]?.ticket?.event_title ?? "Event";
}

export function orderStart(order: Order): string | null {
  return order.items[0]?.ticket?.event_starts_at ?? null;
}
