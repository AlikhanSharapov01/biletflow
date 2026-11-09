import type { BarcodeScanningResult } from "expo-camera";
import { randomUUID } from "expo-crypto";
import { useRef, useState } from "react";

import { checkIn, reverseCheckIn } from "@/api/scanner";
import { SessionExpiredError } from "@/api/session";
import type { AssignedEvent, AttendeeHit, CheckInTarget } from "@/api/types/scanner";
import { feedback } from "@/features/scanner/feedback";
import {
  describeOutcome,
  describeReversal,
  isEntryCode,
  isEntryConfirmation,
} from "@/features/scanner/outcomes";
import type { Admission, PendingScan, Phase, ResultPhase } from "@/features/scanner/scanTypes";
import type { OfflineScanning } from "@/features/scanner/useOfflineScanning";

const NOT_A_CONFIRMATION =
  "That isn’t an entry confirmation. Ask the guest to open their ticket and tap “Show entry confirmation”.";

// The scan → result → (confirm | undo) state machine for one event, plus
// manual check-in from attendee search.
export function useScanSession(
  eventId: string,
  event: AssignedEvent | null | undefined,
  refreshCounts: () => void,
  offline?: Pick<OfflineScanning, "decide" | "pending" | "sync">
) {
  const [phase, setPhase] = useState<Phase>({ name: "scanning" });
  const [reason, setReason] = useState("");
  const [undoing, setUndoing] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);
  // The camera fires onBarcodeScanned for every frame the code is in view;
  // a ref (not state) blocks repeats synchronously until "Scan next".
  const locked = useRef(false);
  const pending = useRef<PendingScan | null>(null);
  // The last code the camera showed while waiting for a confirmation, so a
  // wrong code held in view does not trigger the same error every frame.
  const lastConfirmRead = useRef<string | null>(null);

  async function submit(scan: PendingScan, timeZone: string) {
    setPhase({ name: "checking" });
    let outcome;
    try {
      // The payload goes to the server untouched: deciding whether it's a
      // ticket, a campaign QR or a forgery is the server's job (BF-11).
      outcome = await checkIn(eventId, scan.target, scan.operationId, scan.capturedAt);
    } catch (err) {
      // Session couldn't be renewed: AuthContext is already redirecting to login.
      if (err instanceof SessionExpiredError) return;
      outcome = { kind: "network" as const };
    }
    if (outcome.kind === "network") {
      outcome = (await offline?.decide(scan)) ?? outcome;
    } else if (offline?.pending) {
      // The server answered, so the connection is back.
      void offline.sync(true);
    }
    const view = describeOutcome(outcome, timeZone);
    if (outcome.kind === "admitted" && outcome.replayed) {
      view.lines.push("Confirmed after retry.");
    }
    feedback(view.tone);
    if (view.needsConfirmation) {
      // The ticket itself is fine; ask for (another) confirmation for it.
      const { entryConfirmation: _scanned, entryCode: _typed, ...ticket } = scan.target;
      lastConfirmRead.current = scan.target.entryConfirmation ?? null;
      locked.current = false;
      setPhase({ name: "confirm", ticket, error: scan.target.entryConfirmation || scan.target.entryCode ? `${view.title}. ${view.lines[0] ?? ""}`.trim() : null,
      });
      return;
    }
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

  function start(target: CheckInTarget) {
    if (!event) return;
    locked.current = true;
    pending.current = { target, operationId: randomUUID(), capturedAt: new Date().toISOString() };
    submit(pending.current, event.time_zone);
  }

  function handleScanned({ data }: BarcodeScanningResult) {
    if (locked.current || !event) return;
    if (phase.name === "confirm") {
      if (data === lastConfirmRead.current) return;
      lastConfirmRead.current = data;
      if (!isEntryConfirmation(data)) {
        setPhase({ ...phase, error: NOT_A_CONFIRMATION });
        return;
      }
      start({ ...phase.ticket, entryConfirmation: data });
      return;
    }
    if (phase.name !== "scanning") return;
    if (isEntryConfirmation(data)) {
      // An entry confirmation alone does not say which ticket it is for.
      locked.current = true;
      setPhase({
        name: "result",
        retryable: false,
        view: {
          tone: "warning",
          icon: "?",
          title: "Scan the ticket first",
          lines: ["This is an entry confirmation. Scan the guest’s ticket QR first, then this code."],
        },
      });
      return;
    }
    start({ qrPayload: data });
  }

  // Staff typed the 8-digit code read out by the guest.
  function submitEntryCode(code: string) {
    if (phase.name !== "confirm") return;
    const digits = code.replace(/\s/g, "");
    if (!isEntryCode(digits)) {
      setPhase({ ...phase, error: "Enter the 8-digit code shown on the guest’s ticket." });
      return;
    }
    start({ ...phase.ticket, entryCode: digits });
  }

  function openSearch() {
    locked.current = true;
    setPhase({ name: "search" });
  }

  // Check-in from manual search follows every rule of a scan.
  function checkInAttendee(hit: AttendeeHit) {
    start({ ticketId: hit.ticket_id });
  }

  function retry() {
    if (pending.current && event) submit(pending.current, event.time_zone);
  }

  function scanNext() {
    pending.current = null;
    lastConfirmRead.current = null;
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
    submitEntryCode,
    openSearch,
    checkInAttendee,
    retry,
    scanNext,
    startUndo,
    cancelUndo,
    confirmUndo,
  };
}
