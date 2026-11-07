import { request } from "./client";
import type { PaidSalesChecklist, SimulatedOutcome, SimulatedRecord } from "./types/paidSales";

const id = encodeURIComponent;

// Simulated paid-sales activation (backend/PAID_SALES_API.md).

export function getPaidSales(eventId: string): Promise<PaidSalesChecklist> {
  return request<PaidSalesChecklist>(`/api/v1/events/${id(eventId)}/paid-sales`);
}

export function createPayoutProfile(organizationId: string): Promise<SimulatedRecord> {
  return request<SimulatedRecord>(`/api/v1/organizations/${id(organizationId)}/paid-sales/payout-profile`, { method: "POST" });
}

export function createIdentityVerification(organizationId: string): Promise<SimulatedRecord> {
  return request<SimulatedRecord>(`/api/v1/organizations/${id(organizationId)}/paid-sales/identity-verification`, {
    method: "POST",
  });
}

export function acceptPaidSalesTerms(eventId: string, termsVersion: string): Promise<PaidSalesChecklist> {
  return request<PaidSalesChecklist>(`/api/v1/events/${id(eventId)}/paid-sales/terms`, {
    method: "POST",
    body: { terms_version: termsVersion },
  });
}

// Safe to repeat: an open payment attempt is returned instead of a new charge.
export function startActivation(eventId: string): Promise<PaidSalesChecklist> {
  return request<PaidSalesChecklist>(`/api/v1/events/${id(eventId)}/paid-sales/activation`, { method: "POST" });
}

// Development/test only: act as the payment provider for your own attempt.
export function simulatePayment(attemptId: string, outcome: SimulatedOutcome): Promise<unknown> {
  return request(`/api/v1/simulator/payments/${id(attemptId)}/events`, { method: "POST", body: { outcome } });
}
