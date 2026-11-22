import { t, useLocale } from "../../../i18n";
import { useState } from "react";
import { getGa4Connection, setGa4Connection } from "../../../api/analytics";
import { describeError } from "../../../api/errors";
import type { Ga4Connection } from "../../../api/types/analytics";
import type { Organization } from "../../../api/types";
import { Button, ErrorPanel, FormMessage, Loading, Panel, PanelHeading, StatusPill, useToast } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { dateLabel } from "../../../utils/format";

// Owner-only switch connecting this organization's events to the platform's
// GA4 property (ANALYTICS_API.md, #71). Connecting never backfills: only
// orders confirmed afterwards are exported. While GA4 is off for the whole
// platform there is nothing to connect, and the panel says so.
export function Ga4ConnectionPanel({ organization }: { organization: Organization }) {
  useLocale();
  const { notify } = useToast();
  const connection = useRequest(() => getGa4Connection(organization.id), [organization.id]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const toggle = async (current: Ga4Connection) => {
    setBusy(true);
    setMessage("");
    try {
      const saved = await setGa4Connection(organization.id, !current.is_enabled);
      notify(saved.is_enabled ? t("org.ga4_connected_toast") : t("org.ga4_disconnected_toast"));
      connection.reload();
    } catch (failure) {
      setMessage(describeError(failure));
    } finally {
      setBusy(false);
    }
  };

  const data = connection.data;
  const platformOff = data?.integration === "disabled";
  return (
    <Panel>
      <PanelHeading
        title={t("org.ga4_title")}
        subtitle={t("org.ga4_hint")}
        trailing={
          data ? (
            platformOff ? (
              <StatusPill tone="neutral">{t("org.traffic_off")}</StatusPill>
            ) : data.is_enabled ? (
              <StatusPill tone="positive">{t("org.ga4_connected")}</StatusPill>
            ) : (
              <StatusPill tone="neutral">{t("org.ga4_not_connected")}</StatusPill>
            )
          ) : null
        }
      />
      {connection.loading && !data ? <Loading label={t("org.ga4_loading")} /> : null}
      {connection.error ? <ErrorPanel title={t("org.ga4_load_error")} message={connection.error} onRetry={connection.reload} /> : null}
      {data ? (
        <>
          <p className="form-intro">
            {platformOff
              ? t("org.ga4_platform_off")
              : data.is_enabled && data.enabled_at
                ? t("org.ga4_connected_since", { p0: dateLabel(data.enabled_at) })
                : t("org.ga4_connect_hint")}
          </p>
          <FormMessage message={message} />
          {platformOff && !data.is_enabled ? null : (
            <div className="form-actions">
              <Button variant={data.is_enabled ? "subtle" : "primary"} busy={busy} onClick={() => void toggle(data)}>
                {data.is_enabled ? t("org.ga4_disconnect") : t("org.ga4_connect")}
              </Button>
            </div>
          )}
        </>
      ) : null}
    </Panel>
  );
}
