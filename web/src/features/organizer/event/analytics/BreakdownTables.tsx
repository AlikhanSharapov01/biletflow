import { t, useLocale } from "../../../../i18n";
import type { EventAnalytics } from "../../../../api/types/analytics";
import { EmptyState, Panel, PanelHeading } from "../../../../components/ui";
import { priceLabel } from "../../../../utils/format";

export function BreakdownTables({ data }: { data: EventAnalytics }) {
  useLocale();
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
                    <td>{priceLabel(row.revenue_minor)}</td>
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
                  <th scope="col">{t("common.discount")}</th>
                  <th scope="col">{t("org.revenue")}</th>
                </tr>
              </thead>
              <tbody>
                {data.by_campaign.map((row) => (
                  <tr key={row.campaign_id}>
                    <td>{row.name}</td>
                    <td>{row.redemptions}</td>
                    <td>{priceLabel(row.discount_minor)}</td>
                    <td>{priceLabel(row.revenue_minor)}</td>
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
