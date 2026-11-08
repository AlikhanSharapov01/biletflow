import { View } from "react-native";

import { searchTickets } from "@/api/admin";
import { ListRow, Panel, PanelHeading, StatusPill } from "@/components/ui";
import { AdminSearchForm } from "@/features/admin/components/AdminSearchForm";
import { RowTitle } from "@/features/admin/components/RowTitle";
import { SearchResults } from "@/features/admin/components/SearchResults";
import { SectionNote } from "@/features/admin/components/SectionNote";
import { useAdminSearch } from "@/features/admin/hooks/useAdminSearch";
import { dateLabel, statusLabel } from "@/utils/format";
import { ticketTone } from "@/utils/status";

const STATUSES = ["valid", "checked_in", "refund_pending", "refunded", "cancelled"];

// QR material is never returned by the admin search.
export function AdminTicketsPage() {
  const tickets = useAdminSearch(searchTickets);
  return (
    <Panel>
      <PanelHeading title="Tickets" />
      <SectionNote text="Search by recipient email, ticket id or order id." />
      <AdminSearchForm
        placeholder="guest@example.com or ticket id"
        statuses={STATUSES.map((value) => ({ value, label: statusLabel(value) }))}
        onApply={tickets.apply}
      />
      <SearchResults noun="tickets" {...tickets} onPage={tickets.setOffset}>
        {(items) => (
          <View>
            {items.map((ticket) => (
              <ListRow
                key={ticket.id}
                icon="T"
                title={
                  <RowTitle text={ticket.ticket_type_name}>
                    <StatusPill label={statusLabel(ticket.status)} tone={ticketTone(ticket.status)} />
                  </RowTitle>
                }
                meta={`${ticket.recipient_email} · claimed: ${ticket.claimed ? "Yes" : "Not yet"}`}
                note={`Ticket ${ticket.id.slice(0, 8)} · order ${ticket.order_id.slice(0, 8)} · issued ${dateLabel(ticket.issued_at)}`}
              />
            ))}
          </View>
        )}
      </SearchResults>
    </Panel>
  );
}
