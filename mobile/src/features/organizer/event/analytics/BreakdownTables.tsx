import type { EventAnalytics } from "@/api/types/analytics";
import { EmptyState, ListRow, Panel, PanelHeading } from "@/components/ui";
import { priceLabel } from "@/utils/format";
import { t, useLocale } from "@/i18n";

export function BreakdownTables({ data }: { data: EventAnalytics }) {
  useLocale();
  return (
    <>
      <Panel>
        <PanelHeading title={t("org.by_ticket_type")} />
        {data.by_ticket_type.length === 0 ? (
          <EmptyState message={t("org.no_types_match")} />
        ) : (
          data.by_ticket_type.map((row) => (
            <ListRow
              key={row.ticket_type_id}
              title={row.name}
              meta={t("mobile.org.type_meta", { p0: row.sold, p1: row.capacity, p2: row.checked_in })}
              note={t("mobile.org.revenue_value", { p0: priceLabel(row.revenue_minor) })}
            />
          ))
        )}
      </Panel>
      <Panel>
        <PanelHeading title={t("org.by_campaign")} />
        {data.by_campaign.length === 0 ? (
          <EmptyState message={t("org.no_redemptions")} />
        ) : (
          data.by_campaign.map((row) => (
            <ListRow
              key={row.campaign_id ?? "unattributed"}
              title={row.name}
              meta={t("mobile.org.campaign_meta", { p0: row.redemptions, p1: priceLabel(row.discount_minor) })}
              note={t("mobile.org.revenue_value", { p0: priceLabel(row.revenue_minor) })}
            />
          ))
        )}
      </Panel>
    </>
  );
}
