import { t, useLocale } from "../../../../i18n";
import { getTraffic } from "../../../../api/analytics";
import type { TrafficReport, TrafficState } from "../../../../api/types/analytics";
import { ErrorPanel, Loading, Panel, PanelHeading, StatusPill } from "../../../../components/ui";
import { useRequest } from "../../../../hooks/useRequest";
import { dateLabel } from "../../../../utils/format";

// The funnel in visiting order. Purchases and refunds come from the server;
// sales themselves stay in the reports above.
const STEPS = ["campaign_landing", "event_view", "checkout_start", "purchase", "refund"] as const;

const STEP_LABELS: Record<(typeof STEPS)[number], () => string> = {
  campaign_landing: () => t("org.traffic_campaign_landing"),
  event_view: () => t("org.traffic_event_view"),
  checkout_start: () => t("org.traffic_checkout_start"),
  purchase: () => t("org.traffic_purchase"),
  refund: () => t("org.traffic_refund"),
};

// Why there are no numbers. Never zeros: an empty state is not "no visitors".
const EMPTY: Partial<Record<TrafficState, () => string>> = {
  disabled: () => t("org.traffic_disabled"),
  not_connected: () => t("org.traffic_not_connected"),
  unavailable: () => t("org.traffic_unavailable"),
  error: () => t("org.traffic_error"),
};

function StatePill({ state }: { state: TrafficState }) {
  if (state === "fresh") return <StatusPill tone="positive">{t("org.traffic_fresh")}</StatusPill>;
  if (state === "stale") return <StatusPill tone="pending">{t("org.traffic_stale")}</StatusPill>;
  if (state === "disabled" || state === "not_connected") return <StatusPill tone="neutral">{t("org.traffic_off")}</StatusPill>;
  return <StatusPill tone="blocked">{t("org.traffic_no_data")}</StatusPill>;
}

// GA4 traffic for this event (ANALYTICS_API.md, #71). Optional: with GA4 off
// or the organization not connected it says so plainly instead of showing 0.
export function TrafficPanel({ eventId }: { eventId: string }) {
  useLocale();
  const report = useRequest(() => getTraffic(eventId), [eventId]);
  return (
    <Panel>
      <PanelHeading
        title={t("org.traffic_title")}
        subtitle={t("org.traffic_intro")}
        trailing={report.data ? <StatePill state={report.data.state} /> : null}
      />
      {report.loading && !report.data ? <Loading label={t("org.traffic_loading")} /> : null}
      {report.error ? <ErrorPanel title={t("org.traffic_load_error")} message={report.error} onRetry={report.reload} /> : null}
      {report.data ? <TrafficBody report={report.data} /> : null}
    </Panel>
  );
}

function TrafficBody({ report }: { report: TrafficReport }) {
  const empty = EMPTY[report.state];
  if (!report.metrics || empty) return <p className="form-intro">{empty ? empty() : t("org.traffic_error")}</p>;
  const metrics = report.metrics;
  return (
    <>
      <p className="form-intro">
        {t("org.traffic_range", { p0: report.range.from, p1: report.range.to, p2: report.fetched_at ? dateLabel(report.fetched_at) : "—" })}
      </p>
      {report.state === "stale" ? <p className="form-intro">{t("org.traffic_stale_hint")}</p> : null}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">{t("org.traffic_step")}</th>
              <th scope="col">{t("org.traffic_events")}</th>
              <th scope="col">{t("org.traffic_people")}</th>
            </tr>
          </thead>
          <tbody>
            {STEPS.filter((step) => metrics[step]).map((step) => (
              <tr key={step}>
                <td>{STEP_LABELS[step]()}</td>
                <td>{metrics[step]!.event_count}</td>
                <td>{metrics[step]!.users}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
