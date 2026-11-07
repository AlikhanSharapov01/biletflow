import type { PublicationState } from "../api/types";

// The four pill tones shared with mobile (theme statusTones). Every ticket,
// order and event state picks its tone here so pages stay consistent.
export type StatusTone = "positive" | "pending" | "blocked" | "neutral";

export function ticketTone(status: string | null | undefined): StatusTone {
  if (status === "valid") return "positive";
  if (status === "checked_in") return "neutral";
  if (!status) return "neutral";
  return "blocked";
}

export function orderTone(status: string): StatusTone {
  return status === "confirmed" ? "positive" : "pending";
}

export function publicationTone(state: PublicationState | string): StatusTone {
  if (state === "published") return "positive";
  if (state === "cancelled") return "blocked";
  return "neutral";
}
