// Mirrors backend/app/finance_api.py (contract: backend/FINANCE_API.md).
// Money is integer 1/100 of `currency`. These records are a simulation and
// move no real funds.

export interface EventFinance {
  event_id: string;
  currency: string;
  simulated: boolean;
  simulation_only: boolean;
  environments: string[];
  gross_minor: number;
  discount_minor: number;
  collected_minor: number;
  fulfilled_collected_minor: number;
  charged_fees_minor: number;
  fee_reversals_minor: number;
  fees_minor: number;
  refunds_minor: number;
  pending_refunds_minor: number;
  activation_charges_minor: number;
  activation_refunds_minor: number;
  pending_activation_refunds_minor: number;
  net_minor: number;
  balance_minor: number;
  reserved_minor: number;
  sent_minor: number;
  estimated_payout_minor: number;
  // Payouts can be reserved earlier but only become eligible from this time.
  payout_eligible_at: string;
  generated_at: string;
}

export type PayoutTransferStatus = "pending" | "eligible" | "sent" | "failed";
// "adjusted" is derived: a sent payout followed by later refunds.
export type PayoutStatus = PayoutTransferStatus | "adjusted";
// Targets the demo simulator accepts (pending -> eligible -> sent; pending/eligible -> failed).
export type PayoutSimulationTarget = "eligible" | "sent" | "failed";

export interface Payout {
  id: string;
  event_id: string;
  organization_id: string;
  payout_profile_id: string;
  requested_by_user_id: string;
  amount_minor: number;
  currency: string;
  environment: "simulation";
  simulated: boolean;
  status: PayoutStatus;
  transfer_status: PayoutTransferStatus;
  adjustment_minor: number;
  sent_at: string | null;
  created_at: string;
}
