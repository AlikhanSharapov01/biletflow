import { t, useLocale } from "../../../i18n";
import { useState } from "react";
import { downloadAnalyticsCsv, getAnalytics, getSalesSeries } from "../../../api/analytics";
import { describeError } from "../../../api/errors";
import { listCampaigns } from "../../../api/campaigns";
import { listTicketTypes } from "../../../api/catalog";
import type { EventView } from "../../../api/types";
import type { AnalyticsFilters, SeriesBucket } from "../../../api/types/analytics";
import { Button, EmptyState, ErrorPanel, FormMessage, Loading, Panel, PanelHeading } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { dateLabel } from "../../../utils/format";
import { AnalyticsFilterBar } from "./analytics/AnalyticsFilterBar";
import { BreakdownTables } from "./analytics/BreakdownTables";
import { EnvironmentPill } from "./analytics/EnvironmentPill";
import { SalesChart } from "./analytics/SalesChart";
import { StatTiles } from "./analytics/StatTiles";
import { TrafficPanel } from "./analytics/TrafficPanel";

// Read-only event analytics (backend/ANALYTICS_API.md). Every figure comes
// from the server; the page never recomputes totals.
export function AnalyticsTab({ event }: { event: EventView }) {
  useLocale();
  const [filters, setFilters] = useState<AnalyticsFilters>({});
  const [bucket, setBucket] = useState<SeriesBucket>("day");
  const options = useRequest(async () => {
    // Staff with `reports` but without campaign access still get analytics;
    // the campaign filter is simply not offered to them.
    const [types, campaigns] = await Promise.all([listTicketTypes(event.id), listCampaigns(event.id).catch(() => [])]);
    return { types, campaigns: campaigns.map((campaign) => ({ id: campaign.id, name: campaign.name })) };
  }, [event.id]);
  const report = useRequest(async () => {
    const [summary, series] = await Promise.all([getAnalytics(event.id, filters), getSalesSeries(event.id, filters, bucket)]);
    return { summary, series };
  }, [event.id, filters, bucket]);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const result = report.data;
  const ready = result && !report.loading;

  // Exports exactly the applied filters and grouping shown on screen.
  const exportCsv = async () => {
    setExporting(true);
    setExportError("");
    try {
      await downloadAnalyticsCsv(event.id, filters, bucket);
    } catch (failure) {
      setExportError(describeError(failure));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="stack">
      <Panel>
        <PanelHeading
          title={t("organizer.analytics")}
          subtitle={result ? t("org.analytics_meta", { p0: result.summary.timezone, p1: dateLabel(result.summary.generated_at) }) : t("org.analytics_intro")}
          trailing={result ? <EnvironmentPill simulated={result.summary.revenue.simulated} environments={result.summary.revenue.environments} /> : null}
        />
        <AnalyticsFilterBar
          types={options.data?.types ?? []}
          campaigns={options.data?.campaigns ?? []}
          bucket={bucket}
          onApply={(next, nextBucket) => {
            setFilters(next);
            setBucket(nextBucket);
          }}
        />
        <div className="form-actions">
          <Button onClick={() => void exportCsv()} busy={exporting}>
            {exporting ? t("org.analytics_exporting") : t("org.analytics_export")}
          </Button>
          <span className="field-note">{t("org.analytics_export_note")}</span>
        </div>
        {exportError ? <FormMessage message={exportError} /> : null}
        {report.loading ? <Loading label={t("org.loading_analytics")} /> : null}
        {report.error ? <ErrorPanel title={t("org.analytics_error")} message={report.error} onRetry={report.reload} /> : null}
        {ready ? (
          <>
            <StatTiles data={result.summary} />
            {result.series.points.length === 0 ? (
              <EmptyState>{t("org.no_sales")}</EmptyState>
            ) : (
              <SalesChart points={result.series.points} bucket={result.series.bucket} currency={result.summary.revenue.currency} />
            )}
          </>
        ) : null}
      </Panel>
      {ready ? <BreakdownTables data={result.summary} /> : null}
      <TrafficPanel eventId={event.id} />
    </div>
  );
}
