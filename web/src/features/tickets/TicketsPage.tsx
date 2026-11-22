import { t, useLocale } from "../../i18n";
import { Link } from "react-router";
import { claimTickets, listTickets } from "../../api/tickets";
import { Button, EmptyState, ErrorPanel, EventCard, PageHeading, Panel, SkeletonGrid, StatusPill } from "../../components/ui";
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
      {/* Always present, so a Refresh is announced even though the dimmed list is inert. */}
      <p className="visually-hidden" role="status">{tickets.loading && tickets.data ? t("tickets.loading") : ""}</p>
      {tickets.loading && !tickets.data ? <SkeletonGrid row label={t("tickets.loading")} /> : null}
      {tickets.error ? <ErrorPanel title={t("tickets.load_error")} message={tickets.error} onRetry={tickets.reload} /> : null}
      {tickets.data ? (
        tickets.data.length === 0 ? (
          <Panel>
            <EmptyState>{t("tickets.empty")}{" "}<Link to="/discover">{t("orders.find_event")}</Link>{" "}{t("tickets.claim_hint")}{" "}</EmptyState>
          </Panel>
        ) : (
          <div className="event-grid row-grid" aria-busy={tickets.loading || undefined} inert={tickets.loading}>
            {tickets.data.map((ticket) => {
              const path = `/tickets/${encodeURIComponent(ticket.id)}`;
              return (
                <EventCard
                  key={ticket.id}
                  date={ticket.event_starts_at}
                  title={ticket.event_title}
                  to={path}
                  coverLink
                  meta={[
                    `${dateLabel(ticket.event_starts_at)} · ${ticket.venue_name}`,
                    `${ticket.ticket_type_name} · ${seatLabel(ticket.seat_snapshot)}`,
                  ]}
                  footer={
                    <>
                      <StatusPill tone={ticketTone(ticket.status)}>{statusLabel(ticket.status)}</StatusPill>
                      <span className="event-cue" aria-hidden="true">{t("tickets.show_qr")}</span>
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
