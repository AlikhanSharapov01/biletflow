import type { PayoutSimulationTarget, PayoutTransferStatus } from "../../../../api/types/finance";

// The simulator's allowed moves (FINANCE_API.md): pending -> eligible -> sent,
// and pending or eligible -> failed. Sent and failed are terminal.
export function simulationTargets(status: PayoutTransferStatus): PayoutSimulationTarget[] {
  if (status === "pending") return ["eligible", "failed"];
  if (status === "eligible") return ["sent", "failed"];
  return [];
}
