import { t, translate, useLocale } from "../../../i18n";
import { useState, type FormEvent } from "react";
import { updateSetting } from "../../../api/admin";
import { describeError, errorCodeOf } from "../../../api/errors";
import type { PlatformSetting } from "../../../api/types/admin";
import { Button, FormMessage, ListRow, StatusPill, TextField, useToast } from "../../../components/ui";
import { dateLabel, localInputToIso } from "../../../utils/format";
import { expectedVersion, settingValueError } from "../utils/settings";

interface SettingRowProps {
  setting: PlatformSetting;
  onSaved: () => void;
}

export function SettingRow({ setting, onSaved }: SettingRowProps) {
  useLocale();
  const { notify } = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(setting.pending?.value ?? setting.value));
  const [effective, setEffective] = useState("");
  const [reason, setReason] = useState("");
  const [state, setState] = useState({ busy: false, message: "" });

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problem = settingValueError(value, setting);
    if (problem) {
      setState({ busy: false, message: problem });
      return;
    }
    setState({ busy: true, message: "" });
    try {
      await updateSetting(setting.key, {
        value: Number(value),
        expected_version: expectedVersion(setting),
        ...(effective ? { effective_at: localInputToIso(effective) ?? undefined } : {}),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      notify(t("admin.setting_saved"));
      onSaved();
    } catch (failure) {
      if (errorCodeOf(failure) === "setting_version_conflict") {
        notify(t("admin.setting_conflict"));
        onSaved();
        return;
      }
      setState({ busy: false, message: describeError(failure) });
    }
  };

  return (
    <ListRow
      icon="⚙"
      title={
        <>
          {setting.key}
          <StatusPill tone="neutral">{t("word.version")}{setting.version}</StatusPill>
          {setting.pending ? <StatusPill tone="pending">{t("admin.scheduled_change")}</StatusPill> : null}
        </>
      }
      meta={t("admin.setting_current", { p0: translate(setting.description), p1: setting.value, p2: setting.default, p3: setting.minimum, p4: setting.maximum })}
      note={
        setting.pending
          ? t("admin.setting_changes", { p0: setting.pending.value, p1: dateLabel(setting.pending.effective_at) })
          : setting.effective_at
            ? t("admin.setting_effective", { p0: dateLabel(setting.effective_at) })
            : t("admin.setting_default")
      }
      actions={
        <Button size="sm" onClick={() => setEditing(!editing)}>
          {editing ? t("common.close") : t("admin.change")}
        </Button>
      }
    >
      {editing ? (
        <form className="form-stack inline-form" onSubmit={(event) => void save(event)}>
          <div className="form-grid">
            <TextField label={t("admin.new_value")} type="number" min={setting.minimum} max={setting.maximum} step={1} value={value} onChange={(e) => setValue(e.target.value)} required />
            <TextField label={t("admin.takes_effect")} hint={t("admin.blank_now")} type="datetime-local" value={effective} onChange={(e) => setEffective(e.target.value)} />
          </div>
          <TextField label={t("common.reason")} hint={t("common.optional")} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          <FormMessage message={state.message} />
          <div className="form-actions">
            <Button variant="primary" size="sm" type="submit" disabled={state.busy}>{t("admin.save_setting")}</Button>
          </div>
        </form>
      ) : null}
    </ListRow>
  );
}
