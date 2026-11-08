import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { describeError } from "@/api/errors";
import { assignCase, changeStatus, escalateCase } from "@/api/support";
import { SUPPORT_STATUSES, type SupportCase, type SupportChange, type SupportStatus } from "@/api/types/support";
import { Panel, PanelHeading, SelectField, SubtleButton, TextField } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { colors, fonts } from "@/theme";

import { FormMessage } from "@/components/ui/FormMessage";
import { STATUS_LABELS, canEscalate } from "../utils/supportLabels";

interface StaffActionsProps {
  supportCase: SupportCase;
  viewerId: string;
  // Receives the recorded history item; the screen adds it and re-reads the case.
  onUpdated: (change: SupportChange) => void;
}

const STATUS_OPTIONS = SUPPORT_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] }));

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
        <PanelHeading title="Staff actions" />
        <Text style={styles.copy}>This case is resolved. It reopens if the requester replies.</Text>
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

  const escalate = async () => {
    if (!escalation.trim()) {
      setError("Say why the platform team should take over.");
      return;
    }
    if (await run(() => escalateCase(supportCase.id, escalation.trim()), "Case escalated to the platform team.")) setEscalation("");
  };

  return (
    <Panel style={styles.panel}>
      <PanelHeading title="Staff actions" />
      <Text style={styles.copy}>
        {supportCase.assigned_to ? `Assigned to ${supportCase.assigned_to.display_name}` : "Not assigned"}
      </Text>
      <SelectField label="Status" value={status} options={STATUS_OPTIONS} onChange={(value) => setStatus(value as SupportStatus)} />
      <TextField label="Reason" hint="Optional" value={reason} maxLength={500} onChangeText={setReason} />
      <View style={styles.actions}>
        <SubtleButton
          label="Update status"
          disabled={busy || status === supportCase.status}
          onPress={() => void run(() => changeStatus(supportCase.id, status, reason.trim()), "Status updated.")}
        />
        {assignedToMe ? (
          <SubtleButton label="Unassign me" disabled={busy} onPress={() => void run(() => assignCase(supportCase.id, null), "Case unassigned.")} />
        ) : (
          <SubtleButton
            label="Assign to me"
            disabled={busy}
            onPress={() => void run(() => assignCase(supportCase.id, viewerId), "Case assigned to you.")}
          />
        )}
      </View>
      {canEscalate(supportCase) ? (
        <>
          <TextField label="Escalate to BiletFlow" hint="Reason required" value={escalation} maxLength={500} onChangeText={setEscalation} />
          <SubtleButton danger label="Escalate" disabled={busy} onPress={() => void escalate()} style={styles.start} />
        </>
      ) : null}
      <FormMessage message={error} />
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 12 },
  copy: { color: colors.muted, fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  start: { alignSelf: "flex-start" },
});
