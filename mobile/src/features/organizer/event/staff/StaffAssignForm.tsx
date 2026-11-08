import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { assignStaff } from "@/api/eventAdmin";
import { describeError } from "@/api/errors";
import { EVENT_CAPABILITIES, type EventCapability, type EventView, type MemberDetail } from "@/api/types";
import { Panel, PanelHeading, PrimaryButton, SelectField } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { colors, fonts } from "@/theme";

import { CheckboxField } from "../../components/CheckboxField";
import { FormMessage } from "@/components/ui/FormMessage";
import { formStyles } from "../../components/formStyles";
import { Intro } from "../../components/Intro";

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

  const assign = async () => {
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
      <View style={formStyles.stack}>
        {assignable.length === 0 ? (
          <Intro>
            No assignable team members. Invite people from the organizer workspace first; they must accept the invitation before they can be assigned.
          </Intro>
        ) : null}
        <SelectField
          label="Team member"
          value={memberId}
          placeholder="Choose a member"
          options={assignable.map((member) => ({ value: member.id, label: `${member.display_name} · ${member.email}` }))}
          onChange={setMemberId}
          disabled={assignable.length === 0}
        />
        <View style={formStyles.group} accessibilityLabel="Capabilities">
          <Text style={styles.legend}>Capabilities</Text>
          {EVENT_CAPABILITIES.map((capability) => (
            <CheckboxField
              key={capability.id}
              label={capability.label}
              hint={capability.hint}
              checked={capabilities.includes(capability.id)}
              onChange={() => toggle(capability.id)}
            />
          ))}
        </View>
        <Intro>Assigning the same member again replaces their capabilities for this event.</Intro>
        <FormMessage message={state.message} />
        <PrimaryButton label="Save assignment" onPress={() => void assign()} disabled={assignable.length === 0} loading={state.busy} />
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  legend: { color: colors.ink, fontFamily: fonts.sans, fontSize: 13, fontWeight: "700" },
});
