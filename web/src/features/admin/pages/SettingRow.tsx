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
  };

  return (
    <ListRow
      icon="⚙"
      title={
        <>
          {setting.key}
          <StatusPill tone="neutral">v{setting.version}</StatusPill>
          {setting.pending ? <StatusPill tone="pending">Scheduled change</StatusPill> : null}
        </>
      }
      meta={`${setting.description} · current ${setting.value} (default ${setting.default}, range ${setting.minimum}–${setting.maximum})`}
      note={
        setting.pending
          ? `Changes to ${setting.pending.value} on ${dateLabel(setting.pending.effective_at)}`
          : setting.effective_at
            ? `In force since ${dateLabel(setting.effective_at)}`
            : "Default value, never changed"
      }
      actions={
        <Button size="sm" onClick={() => setEditing(!editing)}>
          {editing ? "Close" : "Change"}
        </Button>
      }
    >
      {editing ? (
        <form className="form-stack inline-form" onSubmit={(event) => void save(event)}>
          <div className="form-grid">
            <TextField label="New value" type="number" min={setting.minimum} max={setting.maximum} step={1} value={value} onChange={(e) => setValue(e.target.value)} required />
            <TextField label="Takes effect" hint="Blank = now" type="datetime-local" value={effective} onChange={(e) => setEffective(e.target.value)} />
          </div>
          <TextField label="Reason" hint="Optional" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          <FormMessage message={state.message} />
          <div className="form-actions">
            <Button variant="primary" size="sm" type="submit" disabled={state.busy}>
              Save setting
            </Button>
          </div>
        </form>
      ) : null}
    </ListRow>
  );
}
