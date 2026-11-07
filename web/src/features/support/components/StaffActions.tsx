import { useState, type FormEvent } from "react";
import { describeError } from "../../../api/errors";
import { assignCase, changeStatus, escalateCase } from "../../../api/support";
import { SUPPORT_STATUSES, type SupportCase, type SupportChange, type SupportStatus } from "../../../api/types/support";
import { Button, FormMessage, Panel, PanelHeading, SelectField, TextField, useToast } from "../../../components/ui";
import { STATUS_LABELS, canEscalate } from "../supportLabels";

interface StaffActionsProps {
  supportCase: SupportCase;
  viewerId: string;
  // Receives the recorded history item; the page adds it and re-reads the case.
  onUpdated: (change: SupportChange) => void;
}

// Status, assignment and escalation for support staff and platform admins.
// Shown only when the case's viewer_roles include support or platform.
export function StaffActions({ supportCase, viewerId, onUpdated }: StaffActionsProps) {
  const { notify } = useToast();
  const [status, setStatus] = useState<SupportStatus>(supportCase.status);
  const [reason, setReason] = useState("");
  const [escalation, setEscalation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const assignedToMe = supportCase.assigned_to?.id === viewerId;

  if (supportCase.status === "resolved") {
    return (
      <Panel tone="note">
        <PanelHeading title="Staff actions" subtitle="This case is resolved. It reopens if the requester replies." />
      </Panel>
    );
  }

  const run = async (action: () => Promise<SupportChange>, done: string) => {
    setBusy(true);
    setError("");
    try {
      onUpdated(await action());
      setReason("");
      notify(done);
      return true;
    } catch (failure) {
      setError(describeError(failure));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleStatus = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(() => changeStatus(supportCase.id, status, reason.trim()), "Status updated.");
  };

  const handleEscalate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!escalation.trim()) {
      setError("Say why the platform team should take over.");
      return;
    }
    if (await run(() => escalateCase(supportCase.id, escalation.trim()), "Case escalated to the platform team.")) setEscalation("");
  };

  return (
    <Panel>
      <PanelHeading title="Staff actions" subtitle={supportCase.assigned_to ? `Assigned to ${supportCase.assigned_to.display_name}` : "Not assigned"} />
      <form className="form-stack" onSubmit={handleStatus}>
        <SelectField label="Status" value={status} onChange={(event) => setStatus(event.target.value as SupportStatus)}>
          {SUPPORT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value]}
            </option>
          ))}
        </SelectField>
        <TextField label="Reason" hint="Optional" value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} />
        <div className="form-actions">
          <Button type="submit" disabled={busy || status === supportCase.status}>
            Update status
          </Button>
          {assignedToMe ? (
            <Button disabled={busy} onClick={() => void run(() => assignCase(supportCase.id, null), "Case unassigned.")}>
              Unassign me
            </Button>
          ) : (
            <Button disabled={busy} onClick={() => void run(() => assignCase(supportCase.id, viewerId), "Case assigned to you.")}>
              Assign to me
            </Button>
          )}
        </div>
      </form>
      {canEscalate(supportCase) ? (
        <form className="form-stack" onSubmit={(event) => void handleEscalate(event)}>
          <TextField
            label="Escalate to BiletFlow"
            hint="Reason required"
            value={escalation}
            maxLength={500}
            onChange={(event) => setEscalation(event.target.value)}
          />
          <div className="form-actions">
            <Button variant="danger" type="submit" disabled={busy}>
              Escalate
            </Button>
          </div>
        </form>
      ) : null}
      {error ? <FormMessage message={error} /> : null}
    </Panel>
  );
}
