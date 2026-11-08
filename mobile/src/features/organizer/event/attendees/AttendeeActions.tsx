import { useState } from "react";
import { View } from "react-native";

import { cancelTicket, refundOrder } from "@/api/eventAdmin";
import { describeError, isNotImplemented } from "@/api/errors";
import type { Attendee } from "@/api/types";
import { ReasonDialog, SubtleButton } from "@/components/ui";
import { useToast } from "@/context/ToastContext";

import { formStyles } from "../../components/formStyles";

interface AttendeeActionsProps {
  eventId: string;
  row: Attendee;
  onDone: () => void;
  // Called when the backend does not serve the planned endpoint yet.
  onPlanned: () => void;
}

type Pending = { title: string; confirmLabel: string; action: (reason: string) => Promise<unknown>; done: string } | null;

// Per-ticket cancel and per-order refund on the PLANNED commerce contract.
// The reason is asked in a dialog (web window.prompt).
export function AttendeeActions({ eventId, row, onDone, onPlanned }: AttendeeActionsProps) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  if (row.status !== "valid") return null;

  const submit = async (reason: string) => {
    if (!pending || !reason) return;
    setBusy(true);
    try {
      await pending.action(reason);
      notify(pending.done);
      setPending(null);
      onDone();
    } catch (failure) {
      setPending(null);
      if (isNotImplemented(failure)) onPlanned();
      else notify(describeError(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={formStyles.actions}>
      <SubtleButton
        danger
        label="Cancel registration"
        disabled={busy}
        onPress={() =>
          setPending({
            title: `Cancel ${row.recipient_name}’s registration? The ticket stops working.`,
            confirmLabel: "Cancel registration",
            action: (reason) => cancelTicket(eventId, row.ticket_id, reason),
            done: "Registration cancelled.",
          })
        }
      />
      <SubtleButton
        label="Refund"
        disabled={busy}
        onPress={() =>
          setPending({
            title: "Refund the whole order this ticket belongs to? Every ticket in it is cancelled.",
            confirmLabel: "Refund",
            action: (reason) => refundOrder(row.order_id, reason),
            done: "Refund requested.",
          })
        }
      />
      <ReasonDialog
        visible={pending !== null}
        title={pending?.title ?? ""}
        confirmLabel={pending?.confirmLabel}
        busy={busy}
        onCancel={() => setPending(null)}
        onSubmit={(reason) => void submit(reason)}
      />
    </View>
  );
}
