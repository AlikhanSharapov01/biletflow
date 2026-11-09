import { t, useLocale } from "../../../i18n";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { assignStaff } from "../../../api/eventAdmin";
import { describeError } from "../../../api/errors";
import { EVENT_CAPABILITIES, type EventCapability, type EventView, type MemberDetail } from "../../../api/types";
import { Button, FormMessage, Panel, PanelHeading, SelectField, useToast } from "../../../components/ui";

interface StaffAssignFormProps {
  event: EventView;
  // Active workspace members who can be assigned.
  assignable: MemberDetail[];
  onAssigned: () => void;
}

export function StaffAssignForm({ event, assignable, onAssigned }: StaffAssignFormProps) {
  useLocale();
  const { notify } = useToast();
  const [state, setState] = useState({ busy: false, message: "" });
  const [memberId, setMemberId] = useState("");
  const [capabilities, setCapabilities] = useState<EventCapability[]>(["scan"]);

  const toggle = (capability: EventCapability) =>
    setCapabilities((current) => (current.includes(capability) ? current.filter((item) => item !== capability) : [...current, capability]));

  const assign = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    if (!memberId) {
      setState({ busy: false, message: t("org.choose_team_member_error") });
      return;
    }
    if (capabilities.length === 0) {
      setState({ busy: false, message: t("org.choose_capability_error") });
      return;
    }
    setState({ busy: true, message: "" });
    try {
      await assignStaff(event.id, memberId, capabilities);
      notify(t("org.assignment_saved"));
      setState({ busy: false, message: "" });
      onAssigned();
    } catch (failure) {
      setState({ busy: false, message: describeError(failure) });
    }
  };

  return (
    <Panel>
      <PanelHeading title={t("org.assign_team_member")} />
      {assignable.length === 0 ? (
        <p className="form-intro">{t("org.no_assignable_members")}{" "}<Link to="/organizer">{t("org.workspace_lower")}</Link>{" "}{t("org.accept_before_assign")}</p>
      ) : null}
      <form className="form-stack" onSubmit={(formEvent) => void assign(formEvent)}>
        <SelectField label={t("org.team_member_label")} value={memberId} onChange={(e) => setMemberId(e.target.value)} required>
          <option value="">{t("org.choose_member")}</option>
          {assignable.map((member) => (
            <option key={member.id} value={member.id}>
              {member.display_name} · {member.email}
            </option>
          ))}
        </SelectField>
        <fieldset className="capability-grid">
          <legend>{t("org.capabilities")}</legend>
          {EVENT_CAPABILITIES.map((capability) => (
            <label className="capability" key={capability.id}>
              <input type="checkbox" checked={capabilities.includes(capability.id)} onChange={() => toggle(capability.id)} />
              <span>
                <strong>{capability.label}</strong>
                <small>{capability.hint}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <p className="form-intro">{t("org.assignment_replace_hint")}</p>
        <FormMessage message={state.message} />
        <div className="form-actions">
          <Button variant="primary" type="submit" disabled={state.busy || assignable.length === 0}>{t("org.save_assignment")}</Button>
        </div>
      </form>
    </Panel>
  );
}
