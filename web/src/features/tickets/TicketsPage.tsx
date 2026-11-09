import { t, useLocale } from "../../i18n";
import { Link } from "react-router";
import { claimTickets, listTickets } from "../../api/tickets";
import { Button, EmptyState, ErrorPanel, EventCard, Loading, PageHeading, Panel, StatusPill } from "../../components/ui";
import { useRequest } from "../../hooks/useRequest";
import { dateLabel, seatLabel, statusLabel } from "../../utils/format";
import { ticketTone } from "../../utils/status";

export function TicketsPage() {
  useLocale();
  // Claiming first links tickets that someone else bought for this email.
  const tickets = useRequest(async () => {
    await claimTickets().catch(() => undefined);
    return listTickets();
  }, []);

  return (
    <>
      <PageHeading
        eyebrow={t("tickets.ready_for_door")}
        title={t("tickets.title")}
        subtitle={t("tickets.subtitle")}
        actions={<Button onClick={tickets.reload}>{t("common.refresh")}</Button>}
      />
      {tickets.loading ? <Loading label={t("tickets.loading")} /> : null}
      {tickets.error ? <ErrorPanel title={t("tickets.load_error")} message={tickets.error} onRetry={tickets.reload} /> : null}
      {tickets.data ? (
        tickets.data.length === 0 ? (
          <Panel>
            <EmptyState>{t("tickets.empty")}{" "}<Link to="/discover">{t("orders.find_event")}</Link>{" "}{t("tickets.claim_hint")}{" "}</EmptyState>
          </Panel>
        ) : (
          <div className="event-grid row-grid">
            {tickets.data.map((ticket) => {
              const path = `/tickets/${encodeURIComponent(ticket.id)}`;
              return (
                <EventCard
                  key={ticket.id}
                  date={ticket.event_starts_at}
                  title={ticket.event_title}
                  to={path}
                  meta={[
                    `${dateLabel(ticket.event_starts_at)} · ${ticket.venue_name}`,
                    `${ticket.ticket_type_name} · ${seatLabel(ticket.seat_snapshot)}`,
                  ]}
                  footer={
                    <>
                      <StatusPill tone={ticketTone(ticket.status)}>{statusLabel(ticket.status)}</StatusPill>
                      <Link className="text-button" to={path}>{t("tickets.show_qr")}{" "}</Link>
                    </>
                  }
                />
              );
            })}
          </div>
        )
      ) : null}
    </>
  );
}
