import type { EventAnalytics } from "@/api/types/analytics";
import { EmptyState, ListRow, Panel, PanelHeading } from "@/components/ui";
import { priceLabel } from "@/utils/format";

export function BreakdownTables({ data }: { data: EventAnalytics }) {
  return (
    <>
      <Panel>
        <PanelHeading title="By ticket type" />
        {data.by_ticket_type.length === 0 ? (
          <EmptyState message="No ticket types match." />
        ) : (
          data.by_ticket_type.map((row) => (
            <ListRow
              key={row.ticket_type_id}
              title={row.name}
              meta={`Sold ${row.sold} / ${row.capacity} · Checked in ${row.checked_in}`}
              note={`Revenue ${priceLabel(row.revenue_minor)}`}
            />
          ))
        )}
      </Panel>
      <Panel>
        <PanelHeading title="By campaign" />
        {data.by_campaign.length === 0 ? (
          <EmptyState message="No campaign redemptions in this range." />
        ) : (
          data.by_campaign.map((row) => (
            <ListRow
              key={row.campaign_id ?? "unattributed"}
              title={row.name}
              meta={`${row.redemptions} redemptions · Discount ${priceLabel(row.discount_minor)}`}
              note={`Revenue ${priceLabel(row.revenue_minor)}`}
            />
          ))
        )}
      </Panel>
    </>
  );
}
