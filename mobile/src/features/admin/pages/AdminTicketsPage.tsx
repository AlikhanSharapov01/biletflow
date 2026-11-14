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
import { t, useLocale } from "@/i18n";

const STATUSES = ["valid", "checked_in", "refund_pending", "refunded", "cancelled"];

// QR material is never returned by the admin search.
export function AdminTicketsPage() {
  useLocale();
  const tickets = useAdminSearch(searchTickets);
  return (
    <Panel>
      <PanelHeading title={t("common.tickets")} />
      <SectionNote text={t("admin.ticket_search_hint")} />
      <AdminSearchForm
        placeholder={t("admin.ticket_search_placeholder")}
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
                meta={t("mobile.admin.ticket_meta", { p0: ticket.recipient_email, p1: ticket.claimed ? t("common.yes") : t("account.not_yet") })}
                note={t("mobile.admin.ticket_note", { p0: ticket.id.slice(0, 8), p1: ticket.order_id.slice(0, 8), p2: dateLabel(ticket.issued_at) })}
              />
            ))}
          </View>
        )}
      </SearchResults>
    </Panel>
  );
}
