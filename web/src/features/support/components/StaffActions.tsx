import { t, useLocale } from "../../../i18n";
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
  useLocale();
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
        <PanelHeading title={t("support.staff_actions")} subtitle={t("support.closed_staff")} />
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
    void run(() => changeStatus(supportCase.id, status, reason.trim()), t("support.status_updated"));
  };

  const handleEscalate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!escalation.trim()) {
      setError(t("support.escalate_reason"));
      return;
    }
    if (await run(() => escalateCase(supportCase.id, escalation.trim()), t("support.escalated_success"))) setEscalation("");
  };

  return (
    <Panel>
      <PanelHeading title={t("support.staff_actions")} subtitle={supportCase.assigned_to ? t("support.assigned_name", { p0: supportCase.assigned_to.display_name }) : t("support.not_assigned")} />
      <form className="form-stack" onSubmit={handleStatus}>
        <SelectField label={t("common.status")} value={status} onChange={(event) => setStatus(event.target.value as SupportStatus)}>
          {SUPPORT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value]}
            </option>
          ))}
        </SelectField>
        <TextField label={t("common.reason")} hint={t("common.optional")} value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} />
        <div className="form-actions">
          <Button type="submit" disabled={busy || status === supportCase.status}>{t("support.update_status")}{" "}</Button>
          {assignedToMe ? (
            <Button disabled={busy} onClick={() => void run(() => assignCase(supportCase.id, null), t("support.unassigned"))}>{t("support.unassign_me")}{" "}</Button>
          ) : (
            <Button disabled={busy} onClick={() => void run(() => assignCase(supportCase.id, viewerId), t("support.assigned_to_you"))}>{t("support.assign_to_me")}{" "}</Button>
          )}
        </div>
      </form>
      {canEscalate(supportCase) ? (
        <form className="form-stack" onSubmit={(event) => void handleEscalate(event)}>
          <TextField
            label={t("support.escalate_to_platform")}
            hint={t("support.reason_required")}
            value={escalation}
            maxLength={500}
            onChange={(event) => setEscalation(event.target.value)}
          />
          <div className="form-actions">
            <Button variant="danger" type="submit" disabled={busy}>{t("support.escalate")}{" "}</Button>
          </div>
        </form>
      ) : null}
      {error ? <FormMessage message={error} /> : null}
    </Panel>
  );
}
