import { t, useLocale } from "../../../i18n";
import { useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
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
  // The action in flight; the other buttons wait (aria-disabled) so focus stays put.
  const [pending, setPending] = useState<"status" | "assign" | "escalate" | null>(null);
  const [error, setError] = useState("");
  const assignedToMe = supportCase.assigned_to?.id === viewerId;
  // The panel stays mounted across the page's re-read, so a button that survives the
  // change keeps focus. When the re-read removes the focused control (the escalation
  // form, or every action once resolved), the panel heading takes focus instead.
  const headingId = useId();
  const refocusHeading = useRef(false);
  const [shownStatus, setShownStatus] = useState(supportCase.status);
  if (shownStatus !== supportCase.status) {
    setShownStatus(supportCase.status);
    setStatus(supportCase.status);
  }
  const escalatable = canEscalate(supportCase);
  useLayoutEffect(() => {
    if (!refocusHeading.current) return;
    if (escalatable) return;
    refocusHeading.current = false;
    const active = document.activeElement;
    if (!active || active === document.body) document.getElementById(headingId)?.focus();
  }, [escalatable, supportCase.status, headingId]);

  if (supportCase.status === "resolved") {
    return (
      <Panel tone="note">
        <PanelHeading title={t("support.staff_actions")} subtitle={t("support.closed_staff")} headingId={headingId} focusable />
      </Panel>
    );
  }

  const run = async (kind: "status" | "assign" | "escalate", action: () => Promise<SupportChange>, done: string) => {
    setPending(kind);
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
      setPending(null);
    }
  };

  const handleStatus = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === supportCase.status) return;
    refocusHeading.current = status === "resolved";
    void run("status", () => changeStatus(supportCase.id, status, reason.trim()), t("support.status_updated")).then((done) => {
      if (!done) refocusHeading.current = false;
    });
  };

  const handleEscalate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!escalation.trim()) {
      setError(t("support.escalate_reason"));
      return;
    }
    refocusHeading.current = true;
    if (await run("escalate", () => escalateCase(supportCase.id, escalation.trim()), t("support.escalated_success"))) setEscalation("");
    else refocusHeading.current = false;
  };

  return (
    <Panel>
      <PanelHeading headingId={headingId} focusable title={t("support.staff_actions")} subtitle={supportCase.assigned_to ? t("support.assigned_name", { p0: supportCase.assigned_to.display_name }) : t("support.not_assigned")} />
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
          <Button type="submit" busy={pending === "status"} aria-disabled={(pending !== null && pending !== "status") || status === supportCase.status}>{t("support.update_status")}{" "}</Button>
          {assignedToMe ? (
            <Button busy={pending === "assign"} aria-disabled={pending !== null && pending !== "assign"} onClick={() => void run("assign", () => assignCase(supportCase.id, null), t("support.unassigned"))}>{t("support.unassign_me")}{" "}</Button>
          ) : (
            <Button busy={pending === "assign"} aria-disabled={pending !== null && pending !== "assign"} onClick={() => void run("assign", () => assignCase(supportCase.id, viewerId), t("support.assigned_to_you"))}>{t("support.assign_to_me")}{" "}</Button>
          )}
        </div>
      </form>
      {escalatable ? (
        <form className="form-stack" onSubmit={(event) => void handleEscalate(event)}>
          <TextField
            label={t("support.escalate_to_platform")}
            hint={t("support.reason_required")}
            value={escalation}
            maxLength={500}
            onChange={(event) => setEscalation(event.target.value)}
          />
          <div className="form-actions">
            <Button variant="danger" type="submit" busy={pending === "escalate"} aria-disabled={pending !== null && pending !== "escalate"}>{t("support.escalate")}{" "}</Button>
          </div>
        </form>
      ) : null}
      {error ? <FormMessage message={error} /> : null}
    </Panel>
  );
}
