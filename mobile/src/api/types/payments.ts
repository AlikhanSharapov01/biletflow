// Mirrors PaymentSummary / RefundSummary in backend/app/checkout_schemas.py and
// the simulator result in activation_schemas.py. Every payment is simulated.

export type PaymentStatus = "created" | "pending" | "succeeded" | "failed" | "unknown" | string;

export interface PaymentSummary {
  id: string;
  status: PaymentStatus;
  charged_minor: number;
  environment: string;
  provider_payment_id: string | null;
  simulated: boolean;
}

export interface RefundSummary {
  id: string;
  payment_attempt_id: string;
  reason: "late_payment" | "duplicate_charge" | "blocked_fulfillment" | string;
  status: "requested" | "pending" | "succeeded" | "failed" | string;
  amount_minor: number;
  latest_attempt_id: string | null;
  latest_attempt_status: string | null;
  simulated: boolean;
}

export type SimulatedOutcome = "pending" | "succeeded" | "failed";

export interface SimulatedPaymentResult {
  provider_event_id: string;
  external_event_id: string;
  attempt: PaymentSummary;
}

// backend/REFUNDS_API.md and app/refund_api.py.
export interface RefundRequestInput {
  reason?: string;
}

export interface CancelRegistrationInput {
  reason?: string;
}

export interface RefundRequested {
  order_id: string;
  status: "requested";
  case_id: string;
}

export interface RefundStarted {
  order_id: string;
  status: string;
  refund: RefundSummary;
}

export interface TicketCancelled {
  ticket_id: string;
  order_id: string;
  status: string;
}
