import type { BarcodeScanningResult } from "expo-camera";
import { randomUUID } from "expo-crypto";
import { useRef, useState } from "react";

import { checkIn, reverseCheckIn } from "@/api/scanner";
import { SessionExpiredError } from "@/api/session";
import type { AssignedEvent } from "@/api/types/scanner";
import { feedback } from "@/features/scanner/feedback";
import { describeOutcome, describeReversal } from "@/features/scanner/outcomes";
import type { Admission, PendingScan, Phase, ResultPhase } from "@/features/scanner/scanTypes";

// The scan → result → (undo) state machine for one event.
export function useScanSession(
  eventId: string,
  event: AssignedEvent | null | undefined,
  refreshCounts: () => void
) {
  const [phase, setPhase] = useState<Phase>({ name: "scanning" });
  const [reason, setReason] = useState("");
  const [undoing, setUndoing] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);
  // The camera fires onBarcodeScanned for every frame the code is in view;
  // a ref (not state) blocks repeats synchronously until "Scan next".
  const locked = useRef(false);
  const pending = useRef<PendingScan | null>(null);

  async function submit(scan: PendingScan, timeZone: string) {
    setPhase({ name: "checking" });
    let outcome;
    try {
      // The payload goes to the server untouched: deciding whether it's a
      // ticket, a campaign QR or a forgery is the server's job (BF-11).
      outcome = await checkIn(eventId, scan.payload, scan.operationId, scan.capturedAt);
    } catch (err) {
      // Session couldn't be renewed: AuthContext is already redirecting to login.
      if (err instanceof SessionExpiredError) return;
      outcome = { kind: "network" as const };
    }
    const view = describeOutcome(outcome, timeZone);
    if (outcome.kind === "admitted" && outcome.replayed) {
      view.lines.push("Confirmed after retry.");
    }
    feedback(view.tone);
    setPhase({
      name: "result",
      view,
      retryable: outcome.kind === "network",
      admission:
        outcome.kind === "admitted"
          ? { checkInId: outcome.check_in_id, attendeeName: outcome.attendee_name }
          : undefined,
    });
    if (outcome.kind === "admitted") refreshCounts();
  }

  function startUndo(result: ResultPhase) {
    if (!result.admission) return;
    setReason("");
    setUndoError(null);
    setPhase({ name: "undo", result, admission: result.admission });
  }

  function cancelUndo(result: ResultPhase) {
    setPhase(result);
  }

  async function confirmUndo(admission: Admission) {
    setUndoing(true);
    setUndoError(null);
    try {
      const result = await reverseCheckIn(admission.checkInId, reason.trim());
      const view = describeReversal(result, admission.attendeeName);
      feedback(view.tone);
      setPhase({ name: "result", view, retryable: false });
      refreshCounts();
    } catch (err) {
      // Session couldn't be renewed: AuthContext is already redirecting to login.
      if (err instanceof SessionExpiredError) return;
      setUndoError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setUndoing(false);
    }
  }

  function handleScanned({ data }: BarcodeScanningResult) {
    if (locked.current || !event) return;
    locked.current = true;
    pending.current = {
      payload: data,
      operationId: randomUUID(),
      capturedAt: new Date().toISOString(),
    };
    submit(pending.current, event.time_zone);
  }

  function retry() {
    if (pending.current && event) submit(pending.current, event.time_zone);
  }

  function scanNext() {
    pending.current = null;
    setPhase({ name: "scanning" });
    locked.current = false;
  }

  // The server requires a non-blank reason (backend ReversalInput).
  const canUndo = reason.trim().length > 0 && !undoing;

  return {
    phase,
    reason,
    setReason,
    undoing,
    undoError,
    canUndo,
    handleScanned,
    retry,
    scanNext,
    startUndo,
    cancelUndo,
    confirmUndo,
  };
}
