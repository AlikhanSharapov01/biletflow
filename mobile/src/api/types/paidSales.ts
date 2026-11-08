// Mirrors backend/app/activation_schemas.py. Everything is simulated: no
// real money moves and `simulated` is always true.

export type ActivationStatus = "incomplete" | "pending" | "active" | "failed" | "suspended";

export type ActivationStep = "paid_ticket_type" | "payout_profile" | "identity_verification" | "terms" | "activation_fee";

export interface PaidSalesPayment {
  id: string;
  status: string;
  charged_minor: number;
  environment: string;
  provider_payment_id: string | null;
  simulated: boolean;
}

export interface PaidSalesChecklist {
  event_id: string;
  status: ActivationStatus | string;
  simulated: boolean;
  missing: ActivationStep[];
  paid_ticket_type: boolean;
  payout_profile_verified: boolean;
  identity_verified: boolean;
  terms: { version: string; text: string; accepted: boolean };
  activation_fee_minor: number;
  currency: string;
  activated_at: string | null;
  suspension_reason: string | null;
  payment: PaidSalesPayment | null;
}

export interface SimulatedRecord {
  id: string;
  status: string;
  environment: string;
}

export type SimulatedOutcome = "pending" | "succeeded" | "failed";
