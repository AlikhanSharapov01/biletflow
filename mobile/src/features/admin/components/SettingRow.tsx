import { useState } from "react";

import type { PlatformSetting } from "@/api/types/admin";
import { ListRow, StatusPill, SubtleButton } from "@/components/ui";
import { RowTitle } from "@/features/admin/components/RowTitle";
import { SettingForm } from "@/features/admin/components/SettingForm";
import { dateLabel } from "@/utils/format";

// One platform setting with its current value and an inline change form.
export function SettingRow({ setting, onSaved }: { setting: PlatformSetting; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);

  return (
    <ListRow
      icon="⚙"
      title={
        <RowTitle text={setting.key}>
          <StatusPill label={`v${setting.version}`} tone="neutral" />
          {setting.pending ? <StatusPill label="Scheduled change" tone="pending" /> : null}
        </RowTitle>
      }
      meta={`${setting.description} · current ${setting.value} (default ${setting.default}, range ${setting.minimum}–${setting.maximum})`}
      note={
        setting.pending
          ? `Changes to ${setting.pending.value} on ${dateLabel(setting.pending.effective_at)}`
          : setting.effective_at
            ? `In force since ${dateLabel(setting.effective_at)}`
            : "Default value, never changed"
      }
      trailing={<SubtleButton label={editing ? "Close" : "Change"} onPress={() => setEditing(!editing)} />}
    >
      {editing ? <SettingForm setting={setting} onSaved={onSaved} /> : null}
    </ListRow>
  );
}
