import { request } from "./client";
import type { EventFinance, Payout, PayoutSimulationTarget } from "./types/finance";

const id = encodeURIComponent;

// Event finance and simulated payouts (backend/FINANCE_API.md). Needs the
// organization's `finance` permission; the owner has it implicitly.

export function getEventFinance(eventId: string): Promise<EventFinance> {
  return request<EventFinance>(`/api/v1/events/${id(eventId)}/finance`);
}

export function listPayouts(eventId: string, page: { limit: number; offset: number }): Promise<Payout[]> {
  return request<Payout[]>(`/api/v1/events/${id(eventId)}/finance/payouts`, { query: page });
}

// Reserves a payout from the payable balance. Reuse the same key when
// retrying the same request so a repeat cannot reserve twice.
export function requestPayout(eventId: string, amountMinor: number, idempotencyKey: string): Promise<Payout> {
  return request<Payout>(`/api/v1/events/${id(eventId)}/finance/payouts`, {
    method: "POST",
    body: { amount_minor: amountMinor },
    idempotencyKey,
  });
}

// Demo-only transition; the backend refuses it (404) outside development/test.
export function simulatePayout(eventId: string, payoutId: string, status: PayoutSimulationTarget): Promise<Payout> {
  return request<Payout>(`/api/v1/events/${id(eventId)}/finance/payouts/${id(payoutId)}/simulate`, {
    method: "POST",
    body: { status },
  });
}
