import { useState } from "react";

import type { PlatformSetting } from "@/api/types/admin";
import { ListRow, StatusPill, SubtleButton } from "@/components/ui";
import { RowTitle } from "@/features/admin/components/RowTitle";
import { SettingForm } from "@/features/admin/components/SettingForm";
import { dateLabel } from "@/utils/format";
import { t, useLocale } from "@/i18n";

// One platform setting with its current value and an inline change form.
export function SettingRow({ setting, onSaved }: { setting: PlatformSetting; onSaved: () => void }) {
  useLocale();
  const [editing, setEditing] = useState(false);

  return (
    <ListRow
      icon="⚙"
      title={
        <RowTitle text={setting.key}>
          <StatusPill label={`v${setting.version}`} tone="neutral" />
          {setting.pending ? <StatusPill label={t("admin.scheduled_change")} tone="pending" /> : null}
        </RowTitle>
      }
      meta={t("admin.setting_current", { p0: setting.description, p1: setting.value, p2: setting.default, p3: setting.minimum, p4: setting.maximum })}
      note={
        setting.pending
          ? t("admin.setting_changes", { p0: setting.pending.value, p1: dateLabel(setting.pending.effective_at) })
          : setting.effective_at
            ? t("admin.setting_effective", { p0: dateLabel(setting.effective_at) })
            : t("admin.setting_default")
      }
      trailing={<SubtleButton label={editing ? t("common.close") : t("admin.change")} onPress={() => setEditing(!editing)} />}
    >
      {editing ? <SettingForm setting={setting} onSaved={onSaved} /> : null}
    </ListRow>
  );
}
