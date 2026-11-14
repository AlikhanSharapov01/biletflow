import { randomUUID } from "expo-crypto";

import { request } from "./http";
import type { EventFinance, Payout, PayoutSimulation } from "./types/finance";

const id = encodeURIComponent;

// Confirmed in backend/FINANCE_API.md (needs the `finance` permission).
export function getEventFinance(eventId: string): Promise<EventFinance> {
  return request<EventFinance>(`/api/v1/events/${id(eventId)}/finance`);
}

export function listPayouts(eventId: string): Promise<Payout[]> {
  return request<Payout[]>(`/api/v1/events/${id(eventId)}/finance/payouts`, { query: { limit: 100 } });
}

// Reserves part of the payable balance as a simulated payout.
export function requestPayout(eventId: string, amountMinor: number, idempotencyKey: string = randomUUID()): Promise<Payout> {
  return request<Payout>(`/api/v1/events/${id(eventId)}/finance/payouts`, {
    method: "POST",
    body: { amount_minor: amountMinor },
    idempotencyKey,
  });
}

// Development and test only: plays the bank moving a payout along.
export function simulatePayout(eventId: string, payoutId: string, status: PayoutSimulation): Promise<Payout> {
  return request<Payout>(`/api/v1/events/${id(eventId)}/finance/payouts/${id(payoutId)}/simulate`, { method: "POST", body: { status } });
}
