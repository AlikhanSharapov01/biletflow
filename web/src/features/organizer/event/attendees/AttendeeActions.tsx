import { useState } from "react";
import { cancelTicket, refundOrder } from "../../../../api/eventAdmin";
import { describeError, isNotImplemented } from "../../../../api/errors";
import type { Attendee } from "../../../../api/types";
import { Button, useToast } from "../../../../components/ui";

interface AttendeeActionsProps {
  eventId: string;
  row: Attendee;
  onDone: () => void;
  // Called when the backend does not serve the planned endpoint yet.
  onPlanned: () => void;
}

// Per-ticket cancel and per-order refund on the PLANNED commerce contract.
export function AttendeeActions({ eventId, row, onDone, onPlanned }: AttendeeActionsProps) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  if (row.status !== "valid") return null;

  const run = async (question: string, action: (reason: string) => Promise<unknown>, done: string) => {
    const reason = window.prompt(`${question}\n\nReason (shown in the activity history):`)?.trim();
    if (!reason) return;
    setBusy(true);
    try {
      await action(reason);
      notify(done);
      onDone();
    } catch (failure) {
      if (isNotImplemented(failure)) onPlanned();
      else notify(describeError(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="row-actions">
      <Button
        size="sm"
        variant="danger"
        disabled={busy}
        onClick={() => void run(`Cancel ${row.recipient_name}’s registration? The ticket stops working.`, (reason) => cancelTicket(eventId, row.ticket_id, reason), "Registration cancelled.")}
      >
        Cancel registration
      </Button>
      <Button
        size="sm"
        disabled={busy}
        onClick={() => void run("Refund the whole order this ticket belongs to? Every ticket in it is cancelled.", (reason) => refundOrder(row.order_id, reason), "Refund requested.")}
      >
        Refund
      </Button>
    </div>
  );
}
