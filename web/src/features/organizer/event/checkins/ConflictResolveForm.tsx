import { t, useLocale } from "../../../../i18n";
import { useState, type FormEvent } from "react";
import { resolveSyncConflict } from "../../../../api/admissionHistory";
import { describeError } from "../../../../api/errors";
import type { SyncConflict } from "../../../../api/types/admission";
import { Button, CheckboxField, FormMessage, TextAreaField, TextField, useToast } from "../../../../components/ui";

interface ConflictResolveFormProps {
  conflict: SyncConflict;
  onResolved: () => void;
}

// Records the decision; optionally reverses the conflicting admission in the
// same action (needs the "Undo check-ins" capability).
export function ConflictResolveForm({ conflict, onResolved }: ConflictResolveFormProps) {
  useLocale();
  const { notify } = useToast();
  const [note, setNote] = useState("");
  const [reverse, setReverse] = useState(false);
  const [reason, setReason] = useState("");
  const [state, setState] = useState({ busy: false, message: "" });
  const canReverse = Boolean(conflict.existing_check_in && !conflict.existing_check_in.reversed_at);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!note.trim()) {
      setState({ busy: false, message: t("org.resolution_hint") });
      return;
    }
    if (reverse && !reason.trim()) {
      setState({ busy: false, message: t("org.reversal_reason_required") });
      return;
    }
    setState({ busy: true, message: "" });
    try {
      const result = await resolveSyncConflict(conflict.id, {
        note: note.trim(),
        ...(reverse ? { reverse_existing_check_in: true, reversal_reason: reason.trim() } : {}),
      });
      notify(result.reversed_check_in_id ? t("org.conflict_resolved_reversed") : t("org.conflict_resolved"));
      onResolved();
    } catch (failure) {
      setState({ busy: false, message: describeError(failure) });
    }
  };

  return (
    <form className="form-stack inline-form" onSubmit={(event) => void submit(event)}>
      <TextAreaField label={t("org.resolution_note")} value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} required />
      {canReverse ? (
        <CheckboxField label={t("org.also_reverse")} checked={reverse} onChange={(e) => setReverse(e.target.checked)} />
      ) : null}
      {reverse ? <TextField label={t("org.reversal_reason")} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} required /> : null}
      <FormMessage message={state.message} />
      <div className="form-actions">
        <Button variant="primary" size="sm" type="submit" disabled={state.busy}>{t("org.resolve_conflict")}</Button>
      </div>
    </form>
  );
}
