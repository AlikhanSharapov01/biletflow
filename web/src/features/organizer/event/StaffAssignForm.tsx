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
  const { notify } = useToast();
  const [state, setState] = useState({ busy: false, message: "" });
  const [memberId, setMemberId] = useState("");
  const [capabilities, setCapabilities] = useState<EventCapability[]>(["scan"]);

  const toggle = (capability: EventCapability) =>
    setCapabilities((current) => (current.includes(capability) ? current.filter((item) => item !== capability) : [...current, capability]));

  const assign = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    if (!memberId) {
      setState({ busy: false, message: "Choose a team member." });
      return;
    }
    if (capabilities.length === 0) {
      setState({ busy: false, message: "Choose at least one capability." });
      return;
    }
    setState({ busy: true, message: "" });
    try {
      await assignStaff(event.id, memberId, capabilities);
      notify("Staff assignment saved.");
      setState({ busy: false, message: "" });
      onAssigned();
    } catch (failure) {
      setState({ busy: false, message: describeError(failure) });
    }
  };

  return (
    <Panel>
      <PanelHeading title="Assign a team member" />
      {assignable.length === 0 ? (
        <p className="form-intro">
          No assignable team members. Invite people from the <Link to="/organizer">organizer workspace</Link> first; they must accept the invitation before they can be assigned.
        </p>
      ) : null}
      <form className="form-stack" onSubmit={(formEvent) => void assign(formEvent)}>
        <SelectField label="Team member" value={memberId} onChange={(e) => setMemberId(e.target.value)} required>
          <option value="">Choose a member</option>
          {assignable.map((member) => (
            <option key={member.id} value={member.id}>
              {member.display_name} · {member.email}
            </option>
          ))}
        </SelectField>
        <fieldset className="capability-grid">
          <legend>Capabilities</legend>
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
        <p className="form-intro">Assigning the same member again replaces their capabilities for this event.</p>
        <FormMessage message={state.message} />
        <div className="form-actions">
          <Button variant="primary" type="submit" disabled={state.busy || assignable.length === 0}>
            Save assignment
          </Button>
        </div>
      </form>
    </Panel>
  );
}
