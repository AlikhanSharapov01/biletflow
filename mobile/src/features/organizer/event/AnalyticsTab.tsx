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

// Read-only event analytics (backend/ANALYTICS_API.md).
export function AnalyticsTab({ event }: { event: EventView }) {
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
          title="Analytics"
          subtitle={
            report.data
              ? `Times in ${report.data.summary.timezone} · generated ${dateLabel(report.data.summary.generated_at)}`
              : "Sales, revenue and attendance for this event."
          }
          trailing={<StatusPill tone="pending" label="Demonstration figures" />}
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
        {report.loading ? <LoadingState message="Loading analytics…" /> : null}
        {report.error ? <ErrorPanel title="We couldn’t load analytics." message={report.error} onRetry={report.reload} /> : null}
        {loaded ? (
          <>
            <StatTiles data={loaded.summary} />
            {loaded.series.points.length === 0 ? (
              <EmptyState message="No sales in this range yet." />
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
