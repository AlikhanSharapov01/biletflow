import { t, useLocale } from "../../../i18n";
import { searchTickets } from "../../../api/admin";
import { Panel, PanelHeading, StatusPill } from "../../../components/ui";
import { dateLabel, statusLabel } from "../../../utils/format";
import { ticketTone } from "../../../utils/status";
import { AdminSearchForm } from "../components/AdminSearchForm";
import { SearchResults } from "../components/SearchResults";
import { useAdminSearch } from "../hooks/useAdminSearch";

const STATUSES = ["valid", "checked_in", "refund_pending", "refunded", "cancelled"];

// QR material is never returned by the admin search.
export function AdminTicketsPage() {
  useLocale();
  const tickets = useAdminSearch(searchTickets);
  return (
    <Panel>
      <PanelHeading title={t("common.tickets")} subtitle={t("admin.ticket_search_hint")} />
      <AdminSearchForm label={t("admin.ticket_search")} placeholder={t("admin.ticket_search_placeholder")} statuses={STATUSES.map((value) => ({ value, label: statusLabel(value) }))} onApply={tickets.apply} />
      <SearchResults noun={t("word.tickets")} {...tickets} onPage={tickets.setOffset}>
        {(items) => (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t("common.ticket")}</th>
                  <th scope="col">{t("admin.recipient")}</th>
                  <th scope="col">{t("admin.type")}</th>
                  <th scope="col">{t("common.status")}</th>
                  <th scope="col">{t("org.claimed")}</th>
                  <th scope="col">{t("org.issued")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((ticket) => (
                  <tr key={ticket.id}>
                    <td>
                      <code className="id-code">{ticket.id.slice(0, 8)}</code>
                      <small className="cell-note">{t("word.order")}{" "}{ticket.order_id.slice(0, 8)}</small>
                    </td>
                    <td>{ticket.recipient_email}</td>
                    <td>{ticket.ticket_type_name}</td>
                    <td>
                      <StatusPill tone={ticketTone(ticket.status)}>{statusLabel(ticket.status)}</StatusPill>
                    </td>
                    <td>{ticket.claimed ? t("common.yes") : t("account.not_yet")}</td>
                    <td>{dateLabel(ticket.issued_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SearchResults>
    </Panel>
  );
}
