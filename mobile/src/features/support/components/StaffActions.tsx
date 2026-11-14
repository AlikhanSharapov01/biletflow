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
import { t, useLocale } from "@/i18n";

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
        <PanelHeading title={t("support.staff_actions")} />
        <Text style={styles.copy}>{t("support.closed_staff")}</Text>
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
      setError(t("support.escalate_reason"));
      return;
    }
    if (await run(() => escalateCase(supportCase.id, escalation.trim()), t("support.escalated_success"))) setEscalation("");
  };

  return (
    <Panel style={styles.panel}>
      <PanelHeading title={t("support.staff_actions")} />
      <Text style={styles.copy}>
        {supportCase.assigned_to ? t("support.assigned_name", { p0: supportCase.assigned_to.display_name }) : t("support.not_assigned")}
      </Text>
      <SelectField label={t("common.status")} value={status} options={STATUS_OPTIONS} onChange={(value) => setStatus(value as SupportStatus)} />
      <TextField label={t("common.reason")} hint={t("common.optional")} value={reason} maxLength={500} onChangeText={setReason} />
      <View style={styles.actions}>
        <SubtleButton
          label={t("support.update_status")}
          disabled={busy || status === supportCase.status}
          onPress={() => void run(() => changeStatus(supportCase.id, status, reason.trim()), t("support.status_updated"))}
        />
        {assignedToMe ? (
          <SubtleButton label={t("support.unassign_me")} disabled={busy} onPress={() => void run(() => assignCase(supportCase.id, null), t("support.unassigned"))} />
        ) : (
          <SubtleButton
            label={t("support.assign_to_me")}
            disabled={busy}
            onPress={() => void run(() => assignCase(supportCase.id, viewerId), t("support.assigned_to_you"))}
          />
        )}
      </View>
      {canEscalate(supportCase) ? (
        <>
          <TextField label={t("support.escalate_to_platform")} hint={t("support.reason_required")} value={escalation} maxLength={500} onChangeText={setEscalation} />
          <SubtleButton danger label={t("support.escalate")} disabled={busy} onPress={() => void escalate()} style={styles.start} />
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
