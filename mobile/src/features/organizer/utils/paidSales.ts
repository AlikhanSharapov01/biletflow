import type { PaidSalesChecklist } from "@/api/types/paidSales";
import type { StatusTone } from "@/utils/status";

export function activationTone(status: string): StatusTone {
  if (status === "active") return "positive";
  if (status === "pending") return "pending";
  if (status === "failed" || status === "suspended") return "blocked";
  return "neutral";
}

// The fee can be paid only when it is the last missing step and no payment
// attempt is still open.
export function canStartActivation(checklist: PaidSalesChecklist): boolean {
  if (checklist.status === "active" || checklist.status === "suspended") return false;
  if (paymentOpen(checklist)) return false;
  return checklist.missing.every((step) => step === "activation_fee");
}

export function paymentOpen(checklist: PaidSalesChecklist): boolean {
  const status = checklist.payment?.status;
  return checklist.status === "pending" && (status === "created" || status === "pending");
}
