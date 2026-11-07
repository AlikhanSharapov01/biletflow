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
  const tickets = useAdminSearch(searchTickets);
  return (
    <Panel>
      <PanelHeading title="Tickets" subtitle="Search by recipient email, ticket id or order id." />
      <AdminSearchForm label="Ticket search" placeholder="guest@example.com or ticket id" statuses={STATUSES.map((value) => ({ value, label: statusLabel(value) }))} onApply={tickets.apply} />
      <SearchResults noun="tickets" {...tickets} onPage={tickets.setOffset}>
        {(items) => (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Ticket</th>
                  <th scope="col">Recipient</th>
                  <th scope="col">Type</th>
                  <th scope="col">Status</th>
                  <th scope="col">Claimed</th>
                  <th scope="col">Issued</th>
                </tr>
              </thead>
              <tbody>
                {items.map((ticket) => (
                  <tr key={ticket.id}>
                    <td>
                      <code className="id-code">{ticket.id.slice(0, 8)}</code>
                      <small className="cell-note">order {ticket.order_id.slice(0, 8)}</small>
                    </td>
                    <td>{ticket.recipient_email}</td>
                    <td>{ticket.ticket_type_name}</td>
                    <td>
                      <StatusPill tone={ticketTone(ticket.status)}>{statusLabel(ticket.status)}</StatusPill>
                    </td>
                    <td>{ticket.claimed ? "Yes" : "Not yet"}</td>
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
