import { useState, type FormEvent } from "react";
import { describeError } from "../../../api/errors";
import { Button, FormMessage, TextAreaField } from "../../../components/ui";

interface ReasonFormProps {
  label: string;
  submitLabel: string;
  danger?: boolean;
  maxLength?: number;
  onSubmit: (reason: string) => Promise<void>;
  onCancel: () => void;
}

// Inline "why?" form for moderation decisions and report resolutions. The
// text is stored in the append-only moderation record.
export function ReasonForm({ label, submitLabel, danger = false, maxLength = 500, onSubmit, onCancel }: ReasonFormProps) {
  const [reason, setReason] = useState("");
  const [state, setState] = useState({ busy: false, message: "" });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reason.trim()) {
      setState({ busy: false, message: "Write a short reason." });
      return;
    }
    setState({ busy: true, message: "" });
    try {
      await onSubmit(reason.trim());
    } catch (failure) {
      setState({ busy: false, message: describeError(failure) });
    }
  };

  return (
    <form className="form-stack inline-form" onSubmit={(event) => void submit(event)}>
      <TextAreaField label={label} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={maxLength} required />
      <FormMessage message={state.message} />
      <div className="form-actions">
        <Button variant={danger ? "danger" : "primary"} size="sm" type="submit" disabled={state.busy}>
          {submitLabel}
        </Button>
        <Button size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
