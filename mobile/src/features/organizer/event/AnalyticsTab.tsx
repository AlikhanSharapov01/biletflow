import { useState } from "react";

import { getAnalytics, getSalesSeries } from "@/api/analytics";
import { listTicketTypes } from "@/api/catalog";
import type { EventView } from "@/api/types";
import type { AnalyticsFilters, SeriesBucket } from "@/api/types/analytics";
import { EmptyState, ErrorPanel, LoadingState, NotAvailableYet, Panel, StatusPill } from "@/components/ui";
import { useRequest } from "@/hooks/useRequest";
import { dateLabel } from "@/utils/format";

import { SectionHeading } from "../components/SectionHeading";
import { orPlanned } from "../utils/planned";
import { AnalyticsFilterBar } from "./analytics/AnalyticsFilterBar";
import { BreakdownTables } from "./analytics/BreakdownTables";
import { SalesChart } from "./analytics/SalesChart";
import { StatTiles } from "./analytics/StatTiles";

// Read-only event analytics on the PLANNED contract (plan section 3).
export function AnalyticsTab({ event }: { event: EventView }) {
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
  const loaded = result && !result.planned && !report.loading ? result.value : null;
  const campaigns = result && !result.planned ? result.value.summary.by_campaign.map((row) => ({ id: row.campaign_id, name: row.name })) : [];

  return (
    <>
      <Panel>
        <SectionHeading
          title="Analytics"
          subtitle={
            result && !result.planned
              ? `Times in ${result.value.summary.timezone} · generated ${dateLabel(result.value.summary.generated_at)}`
              : "Sales, revenue and attendance for this event."
          }
          trailing={<StatusPill tone="pending" label="Demonstration figures" />}
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
        {report.loading ? <LoadingState message="Loading analytics…" /> : null}
        {report.error ? <ErrorPanel title="We couldn’t load analytics." message={report.error} onRetry={report.reload} /> : null}
        {result?.planned && !report.loading ? <NotAvailableYet feature="Analytics" /> : null}
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
