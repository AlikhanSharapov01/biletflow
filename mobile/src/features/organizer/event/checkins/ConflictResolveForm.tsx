import { useState } from "react";
import { View } from "react-native";

import { resolveSyncConflict } from "@/api/admissionHistory";
import { describeError } from "@/api/errors";
import type { SyncConflict } from "@/api/types/admission";
import { PrimaryButton, TextField } from "@/components/ui";
import { useToast } from "@/context/ToastContext";

import { CheckboxField } from "../../components/CheckboxField";
import { FormMessage } from "@/components/ui/FormMessage";
import { formStyles } from "../../components/formStyles";

interface ConflictResolveFormProps {
  conflict: SyncConflict;
  onResolved: () => void;
}

// Records the decision; optionally reverses the conflicting admission in the
// same action (needs the "Undo check-ins" capability).
export function ConflictResolveForm({ conflict, onResolved }: ConflictResolveFormProps) {
  const { notify } = useToast();
  const [note, setNote] = useState("");
  const [reverse, setReverse] = useState(false);
  const [reason, setReason] = useState("");
  const [state, setState] = useState({ busy: false, message: "" });
  const canReverse = Boolean(conflict.existing_check_in && !conflict.existing_check_in.reversed_at);

  const submit = async () => {
    if (!note.trim()) {
      setState({ busy: false, message: "Add a note describing what happened at the gate." });
      return;
    }
    if (reverse && !reason.trim()) {
      setState({ busy: false, message: "Give a reason for reversing the existing admission." });
      return;
    }
    setState({ busy: true, message: "" });
    try {
      const result = await resolveSyncConflict(conflict.id, {
        note: note.trim(),
        ...(reverse ? { reverse_existing_check_in: true, reversal_reason: reason.trim() } : {}),
      });
      notify(result.reversed_check_in_id ? "Conflict resolved and the earlier admission reversed." : "Conflict resolved.");
      onResolved();
    } catch (failure) {
      setState({ busy: false, message: describeError(failure) });
    }
  };

  return (
    <View style={formStyles.inline}>
      <TextField label="Resolution note" value={note} onChangeText={setNote} multiline maxLength={1000} />
      {canReverse ? <CheckboxField label="Also reverse the existing admission" checked={reverse} onChange={setReverse} /> : null}
      {reverse ? <TextField label="Reversal reason" value={reason} onChangeText={setReason} maxLength={500} /> : null}
      <FormMessage message={state.message} />
      <PrimaryButton label="Resolve conflict" onPress={() => void submit()} loading={state.busy} />
    </View>
  );
}
