import { t, useLocale } from "../../../i18n";
import { listSettings } from "../../../api/admin";
import { ErrorPanel, Loading, Panel, PanelHeading } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { SettingRow } from "./SettingRow";

// Platform settings. Changes are prospective and versioned; a stale edit is
// refused with setting_version_conflict instead of overwriting someone else.
export function AdminSettingsPage() {
  useLocale();
  const settings = useRequest(() => listSettings(), []);

  return (
    <Panel>
      <PanelHeading
        title={t("admin.platform_settings")}
        subtitle={t("admin.settings_hint")}
      />
      {settings.loading && !settings.data ? <Loading label={t("admin.loading_settings")} /> : null}
      {settings.error ? <ErrorPanel title={t("admin.settings_error")} message={settings.error} onRetry={settings.reload} /> : null}
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
