import { View } from "react-native";

import { listSettings } from "@/api/admin";
import { ErrorPanel, LoadingState, Panel, PanelHeading } from "@/components/ui";
import { SettingRow } from "@/features/admin/components/SettingRow";
import { SectionNote } from "@/features/admin/components/SectionNote";
import { useRequest } from "@/hooks/useRequest";
import { t, useLocale } from "@/i18n";

// Platform settings. Changes are prospective and versioned; a stale edit is
// refused with setting_version_conflict instead of overwriting someone else.
export function AdminSettingsPage() {
  useLocale();
  const settings = useRequest(() => listSettings(), []);

  return (
    <Panel>
      <PanelHeading title={t("admin.platform_settings")} />
      <SectionNote text={t("admin.settings_hint")} />
      {settings.loading && !settings.data ? <LoadingState message={t("admin.loading_settings")} /> : null}
      {settings.error ? (
        <ErrorPanel title={t("admin.settings_error")} message={settings.error} onRetry={settings.reload} />
      ) : null}
      {settings.data ? (
        <View>
          {settings.data.map((setting) => (
            <SettingRow
              key={`${setting.key}-${setting.version}-${setting.pending?.version ?? 0}`}
              setting={setting}
              onSaved={settings.reload}
            />
          ))}
        </View>
      ) : null}
    </Panel>
  );
}
