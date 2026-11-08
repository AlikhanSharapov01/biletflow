// PLANNED contract: per-event finance summary (simulated payouts).

export interface EventFinance {
  event_id: string;
  currency: string;
  simulated: boolean;
  gross_minor: number;
  fees_minor: number;
  refunds_minor: number;
  estimated_payout_minor: number;
  generated_at: string;
}
