import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { updateSetting } from "@/api/admin";
import { describeError, errorCodeOf } from "@/api/errors";
import type { PlatformSetting } from "@/api/types/admin";
import { PrimaryButton, TextField } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { expectedVersion, settingValueError } from "@/features/admin/utils/settings";
import { colors, fonts } from "@/theme";
import { localInputToIso } from "@/utils/format";

// New value, optional start time ("YYYY-MM-DD HH:mm", blank = now) and reason.
export function SettingForm({ setting, onSaved }: { setting: PlatformSetting; onSaved: () => void }) {
  const { notify } = useToast();
  const [value, setValue] = useState(String(setting.pending?.value ?? setting.value));
  const [effective, setEffective] = useState("");
  const [reason, setReason] = useState("");
  const [state, setState] = useState({ busy: false, message: "" });

  async function save() {
    const problem = settingValueError(value, setting);
    if (problem) {
      setState({ busy: false, message: problem });
      return;
    }
    const effectiveAt = effective.trim() ? localInputToIso(effective.trim().replace(" ", "T")) : null;
    if (effective.trim() && !effectiveAt) {
      setState({ busy: false, message: "Write the time as YYYY-MM-DD HH:mm." });
      return;
    }
    setState({ busy: true, message: "" });
    try {
      await updateSetting(setting.key, {
        value: Number(value),
        expected_version: expectedVersion(setting),
        ...(effectiveAt ? { effective_at: effectiveAt } : {}),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      notify("Setting saved.");
      onSaved();
    } catch (failure) {
      if (errorCodeOf(failure) === "setting_version_conflict") {
        notify("Another admin changed this setting. The latest version is shown; review it and try again.");
        onSaved();
        return;
      }
      setState({ busy: false, message: describeError(failure) });
    }
  }

  return (
    <View style={styles.form}>
      <TextField label="New value" keyboardType="number-pad" value={value} onChangeText={setValue} />
      <TextField
        label="Takes effect"
        hint="Blank = now"
        placeholder="YYYY-MM-DD HH:mm"
        autoCapitalize="none"
        autoCorrect={false}
        value={effective}
        onChangeText={setEffective}
      />
      <TextField label="Reason" hint="Optional" value={reason} onChangeText={setReason} maxLength={500} />
      {state.message ? <Text style={styles.message}>{state.message}</Text> : null}
      <PrimaryButton label="Save setting" onPress={() => void save()} loading={state.busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12 },
  message: { color: colors.error, fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
});
