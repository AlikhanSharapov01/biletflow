import { getTraffic } from "@/api/analytics";
import type { TrafficReport, TrafficState } from "@/api/types/analytics";
import { ErrorPanel, ListRow, LoadingState, Panel, StatusPill } from "@/components/ui";
import { useRequest } from "@/hooks/useRequest";
import { t, useLocale } from "@/i18n";
import { dateLabel } from "@/utils/format";
import type { StatusTone } from "@/utils/status";

import { Intro } from "../../components/Intro";
import { SectionHeading } from "../../components/SectionHeading";

// The funnel in visiting order. Purchases and refunds come from the server;
// sales themselves stay in the reports above.
const STEPS = ["campaign_landing", "event_view", "checkout_start", "purchase", "refund"] as const;

const STEP_LABELS: Record<(typeof STEPS)[number], () => string> = {
  campaign_landing: () => t("mobile.org.traffic_campaign_landing"),
  event_view: () => t("mobile.org.traffic_event_view"),
  checkout_start: () => t("mobile.org.traffic_checkout_start"),
  purchase: () => t("mobile.org.traffic_purchase"),
  refund: () => t("mobile.org.traffic_refund"),
};

// Why there are no numbers. Never zeros: an empty state is not "no visitors".
const EMPTY: Partial<Record<TrafficState, () => string>> = {
  disabled: () => t("mobile.org.traffic_disabled"),
  not_connected: () => t("mobile.org.traffic_not_connected"),
  unavailable: () => t("mobile.org.traffic_unavailable"),
  error: () => t("mobile.org.traffic_error"),
};

function statePill(state: TrafficState): { tone: StatusTone; label: string } {
  if (state === "fresh") return { tone: "positive", label: t("mobile.org.traffic_fresh") };
  if (state === "stale") return { tone: "pending", label: t("mobile.org.traffic_stale") };
  if (state === "disabled" || state === "not_connected") return { tone: "neutral", label: t("mobile.org.traffic_off") };
  return { tone: "blocked", label: t("mobile.org.traffic_no_data") };
}

// GA4 traffic for this event (ANALYTICS_API.md, #71). Optional: with GA4 off
// or the organization not connected it says so plainly instead of showing 0.
export function TrafficPanel({ eventId }: { eventId: string }) {
  useLocale();
  const report = useRequest(() => getTraffic(eventId), [eventId]);

  return (
    <Panel>
      <SectionHeading
        title={t("mobile.org.traffic_title")}
        subtitle={t("mobile.org.traffic_intro")}
        trailing={report.data ? <StatusPill {...statePill(report.data.state)} /> : null}
      />
      {report.loading && !report.data ? <LoadingState message={t("mobile.org.traffic_loading")} /> : null}
      {report.error ? <ErrorPanel title={t("mobile.org.traffic_load_error")} message={report.error} onRetry={report.reload} /> : null}
      {report.data ? <TrafficBody report={report.data} /> : null}
    </Panel>
  );
}

function TrafficBody({ report }: { report: TrafficReport }) {
  const empty = EMPTY[report.state];
  if (!report.metrics || empty) return <Intro>{empty ? empty() : t("mobile.org.traffic_error")}</Intro>;
  const metrics = report.metrics;
  return (
    <>
      <Intro>
        {t("mobile.org.traffic_range", {
          p0: report.range.from,
          p1: report.range.to,
          p2: report.fetched_at ? dateLabel(report.fetched_at) : "—",
        })}
      </Intro>
      {report.state === "stale" ? <Intro>{t("mobile.org.traffic_stale_hint")}</Intro> : null}
      {STEPS.filter((step) => metrics[step]).map((step) => (
        <ListRow
          key={step}
          title={STEP_LABELS[step]()}
          meta={t("mobile.org.traffic_counts", { p0: metrics[step]!.event_count, p1: metrics[step]!.users })}
        />
      ))}
    </>
  );
}
