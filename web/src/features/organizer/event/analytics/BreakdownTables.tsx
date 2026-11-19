import { t, useLocale } from "../../../../i18n";
import type { CampaignMetrics, EventAnalytics } from "../../../../api/types/analytics";
import { EmptyState, Panel, PanelHeading } from "../../../../components/ui";
import { moneyLabel } from "../../../../utils/format";

// Sales without an eligible campaign come back as one row with a null id.
function campaignName(row: CampaignMetrics): string {
  return row.campaign_id === null ? t("org.unattributed") : row.name;
}

export function BreakdownTables({ data }: { data: EventAnalytics }) {
  useLocale();
  const money = (minor: number) => moneyLabel(minor, data.revenue.currency);
  return (
    <div className="analytics-tables">
      <Panel>
        <PanelHeading title={t("org.by_ticket_type")} />
        {data.by_ticket_type.length === 0 ? (
          <EmptyState>{t("org.no_types_match")}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t("org.ticket_type")}</th>
                  <th scope="col">{t("checkout.sold")}</th>
                  <th scope="col">{t("tickets.checked_in")}</th>
                  <th scope="col">{t("org.revenue")}</th>
                </tr>
              </thead>
              <tbody>
                {data.by_ticket_type.map((row) => (
                  <tr key={row.ticket_type_id}>
                    <td>{row.name}</td>
                    <td>
                      {row.sold} / {row.capacity}
                    </td>
                    <td>{row.checked_in}</td>
                    <td>{money(row.revenue_minor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <Panel>
        <PanelHeading title={t("org.by_campaign")} />
        {data.by_campaign.length === 0 ? (
          <EmptyState>{t("org.no_redemptions")}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t("org.campaign")}</th>
                  <th scope="col">{t("org.redemptions")}</th>
                  <th scope="col">{t("org.tickets_kept_refunded")}</th>
                  <th scope="col">{t("common.discount")}</th>
                  <th scope="col">{t("org.refunds_col")}</th>
                  <th scope="col">{t("org.revenue")}</th>
                </tr>
              </thead>
              <tbody>
                {data.by_campaign.map((row) => (
                  <tr key={row.campaign_id ?? "unattributed"}>
                    <td>{campaignName(row)}</td>
                    <td>{row.redemptions}</td>
                    <td>
                      {row.retained_tickets} / {row.refunded_tickets}
                    </td>
                    <td>{money(row.discount_minor)}</td>
                    <td>{money(row.refunds_minor)}</td>
                    <td>{money(row.revenue_minor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
