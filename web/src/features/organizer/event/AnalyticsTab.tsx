import { t, useLocale } from "../../../i18n";
import { useState } from "react";
import { getAnalytics, getSalesSeries } from "../../../api/analytics";
import { listTicketTypes } from "../../../api/catalog";
import type { EventView } from "../../../api/types";
import type { AnalyticsFilters, SeriesBucket } from "../../../api/types/analytics";
import { EmptyState, ErrorPanel, Loading, NotAvailableYet, Panel, PanelHeading, StatusPill } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { dateLabel } from "../../../utils/format";
import { orPlanned } from "../utils/planned";
import { AnalyticsFilterBar } from "./analytics/AnalyticsFilterBar";
import { BreakdownTables } from "./analytics/BreakdownTables";
import { SalesChart } from "./analytics/SalesChart";
import { StatTiles } from "./analytics/StatTiles";

// Read-only event analytics on the PLANNED contract (plan section 3).
export function AnalyticsTab({ event }: { event: EventView }) {
  useLocale();
  const [filters, setFilters] = useState<AnalyticsFilters>({});
  const [bucket, setBucket] = useState<SeriesBucket>("day");
  const types = useRequest(() => listTicketTypes(event.id), [event.id]);
  const report = useRequest(
    () =>
      orPlanned(async () => {
        const [summary, series] = await Promise.all([getAnalytics(event.id, filters), getSalesSeries(event.id, filters, bucket)]);
        return { summary, series };
      }),
    [event.id, filters, bucket],
  );

  const result = report.data;
  const campaigns = result && !result.planned ? result.value.summary.by_campaign.map((row) => ({ id: row.campaign_id, name: row.name })) : [];

  return (
    <div className="stack">
      <Panel>
        <PanelHeading
          title={t("organizer.analytics")}
          subtitle={result && !result.planned ? t("org.analytics_meta", { p0: result.value.summary.timezone, p1: dateLabel(result.value.summary.generated_at) }) : t("org.analytics_intro")}
          trailing={<StatusPill tone="pending">{t("org.finance_demo")}</StatusPill>}
        />
        <AnalyticsFilterBar
          types={types.data ?? []}
          campaigns={campaigns}
          bucket={bucket}
          disabled={Boolean(result?.planned)}
          onApply={(next, nextBucket) => {
            setFilters(next);
            setBucket(nextBucket);
          }}
        />
        {report.loading ? <Loading label={t("org.loading_analytics")} /> : null}
        {report.error ? <ErrorPanel title={t("org.analytics_error")} message={report.error} onRetry={report.reload} /> : null}
        {result?.planned && !report.loading ? <NotAvailableYet feature={t("organizer.analytics")} /> : null}
        {result && !result.planned && !report.loading ? (
          <>
            <StatTiles data={result.value.summary} />
            {result.value.series.points.length === 0 ? (
              <EmptyState>{t("org.no_sales")}</EmptyState>
            ) : (
              <SalesChart points={result.value.series.points} bucket={result.value.series.bucket} />
            )}
          </>
        ) : null}
      </Panel>
      {result && !result.planned && !report.loading ? <BreakdownTables data={result.value.summary} /> : null}
    </div>
  );
}
