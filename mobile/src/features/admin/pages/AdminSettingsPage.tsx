import { View } from "react-native";

import { listSettings } from "@/api/admin";
import { ErrorPanel, LoadingState, Panel, PanelHeading } from "@/components/ui";
import { SettingRow } from "@/features/admin/components/SettingRow";
import { SectionNote } from "@/features/admin/components/SectionNote";
import { useRequest } from "@/hooks/useRequest";

// Platform settings. Changes are prospective and versioned; a stale edit is
// refused with setting_version_conflict instead of overwriting someone else.
export function AdminSettingsPage() {
  const settings = useRequest(() => listSettings(), []);

  return (
    <Panel>
      <PanelHeading title="Platform settings" />
      <SectionNote text="Existing orders, holds and activations keep the values they started with. New values may take effect now or at a scheduled time." />
      {settings.loading && !settings.data ? <LoadingState message="Loading settings…" /> : null}
      {settings.error ? (
        <ErrorPanel title="We couldn’t load settings." message={settings.error} onRetry={settings.reload} />
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
