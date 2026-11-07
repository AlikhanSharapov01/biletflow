import { listSettings } from "../../../api/admin";
import { ErrorPanel, Loading, Panel, PanelHeading } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { SettingRow } from "./SettingRow";

// Platform settings. Changes are prospective and versioned; a stale edit is
// refused with setting_version_conflict instead of overwriting someone else.
export function AdminSettingsPage() {
  const settings = useRequest(() => listSettings(), []);

  return (
    <Panel>
      <PanelHeading
        title="Platform settings"
        subtitle="Existing orders, holds and activations keep the values they started with. New values may take effect now or at a scheduled time."
      />
      {settings.loading && !settings.data ? <Loading label="Loading settings…" /> : null}
      {settings.error ? <ErrorPanel title="We couldn’t load settings." message={settings.error} onRetry={settings.reload} /> : null}
      {settings.data ? (
        <div className="list">
          {settings.data.map((setting) => (
            <SettingRow key={`${setting.key}-${setting.version}-${setting.pending?.version ?? 0}`} setting={setting} onSaved={settings.reload} />
          ))}
        </div>
      ) : null}
    </Panel>
  );
}
