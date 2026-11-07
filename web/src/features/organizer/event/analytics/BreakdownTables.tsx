import type { EventAnalytics } from "../../../../api/types/analytics";
import { EmptyState, Panel, PanelHeading } from "../../../../components/ui";
import { priceLabel } from "../../../../utils/format";

export function BreakdownTables({ data }: { data: EventAnalytics }) {
  return (
    <div className="analytics-tables">
      <Panel>
        <PanelHeading title="By ticket type" />
        {data.by_ticket_type.length === 0 ? (
          <EmptyState>No ticket types match.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Ticket type</th>
                  <th scope="col">Sold</th>
                  <th scope="col">Checked in</th>
                  <th scope="col">Revenue</th>
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
        <PanelHeading title="By campaign" />
        {data.by_campaign.length === 0 ? (
          <EmptyState>No campaign redemptions in this range.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Campaign</th>
                  <th scope="col">Redemptions</th>
                  <th scope="col">Discount</th>
                  <th scope="col">Revenue</th>
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
