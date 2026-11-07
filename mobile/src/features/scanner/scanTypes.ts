import type { OutcomeView } from "@/features/scanner/outcomes";

// One physical scan. Kept so "Retry" can resend the same operation_id, which
// makes the server return the original admission instead of "already used".
export type PendingScan = {
  payload: string;
  operationId: string;
  capturedAt: string;
};

// The admission this screen just made, kept so it can be undone.
export type Admission = {
  checkInId: string;
  attendeeName: string;
};

export type ResultPhase = {
  name: "result";
  view: OutcomeView;
  retryable: boolean;
  admission?: Admission;
};

export type Phase =
  | { name: "scanning" }
  | { name: "checking" }
  | ResultPhase
  // Asking for a reason before undoing; Cancel returns to `result`.
  | { name: "undo"; result: ResultPhase; admission: Admission };
