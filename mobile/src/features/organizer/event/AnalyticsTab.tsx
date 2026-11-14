import { useState } from "react";

import { getAnalytics, getSalesSeries } from "@/api/analytics";
import { listTicketTypes } from "@/api/catalog";
import type { EventView } from "@/api/types";
import type { AnalyticsFilters, SeriesBucket } from "@/api/types/analytics";
import { EmptyState, ErrorPanel, LoadingState, Panel, StatusPill } from "@/components/ui";
import { useRequest } from "@/hooks/useRequest";
import { dateLabel } from "@/utils/format";

import { SectionHeading } from "../components/SectionHeading";
import { AnalyticsFilterBar } from "./analytics/AnalyticsFilterBar";
import { BreakdownTables } from "./analytics/BreakdownTables";
import { SalesChart } from "./analytics/SalesChart";
import { StatTiles } from "./analytics/StatTiles";
import { t, useLocale } from "@/i18n";

// Read-only event analytics (backend/ANALYTICS_API.md).
export function AnalyticsTab({ event }: { event: EventView }) {
  useLocale();
  const [filters, setFilters] = useState<AnalyticsFilters>({});
  const [bucket, setBucket] = useState<SeriesBucket>("day");
  const types = useRequest(() => listTicketTypes(event.id), [event.id]);
  const report = useRequest(async () => {
    const [summary, series] = await Promise.all([getAnalytics(event.id, filters), getSalesSeries(event.id, filters, bucket)]);
    return { summary, series };
  }, [event.id, filters, bucket]);

  const loaded = report.data && !report.loading ? report.data : null;
  // Sales no campaign applies to come back as "Unattributed" with no id; they cannot be filtered on.
  const campaigns = (report.data?.summary.by_campaign ?? []).flatMap((row) => (row.campaign_id ? [{ id: row.campaign_id, name: row.name }] : []));

  return (
    <>
      <Panel>
        <SectionHeading
          title={t("organizer.analytics")}
          subtitle={
            report.data
              ? t("org.analytics_meta", { p0: report.data.summary.timezone, p1: dateLabel(report.data.summary.generated_at) })
              : t("org.analytics_intro")
          }
          trailing={<StatusPill tone="pending" label={t("org.finance_demo")} />}
        />
        <AnalyticsFilterBar
          types={types.data ?? []}
          campaigns={campaigns}
          bucket={bucket}
          onApply={(next, nextBucket) => {
            setFilters(next);
            setBucket(nextBucket);
          }}
        />
        {report.loading ? <LoadingState message={t("org.loading_analytics")} /> : null}
        {report.error ? <ErrorPanel title={t("org.analytics_error")} message={report.error} onRetry={report.reload} /> : null}
        {loaded ? (
          <>
            <StatTiles data={loaded.summary} />
            {loaded.series.points.length === 0 ? (
              <EmptyState message={t("org.no_sales")} />
            ) : (
              <SalesChart points={loaded.series.points} bucket={loaded.series.bucket} />
            )}
          </>
        ) : null}
      </Panel>
      {loaded ? <BreakdownTables data={loaded.summary} /> : null}
    </>
  );
}
