import { Link } from "react-router";
import { claimTickets, listTickets } from "../../api/tickets";
import { Button, EmptyState, ErrorPanel, EventCard, Loading, PageHeading, Panel, StatusPill } from "../../components/ui";
import { useRequest } from "../../hooks/useRequest";
import { dateLabel, seatLabel, statusLabel } from "../../utils/format";
import { ticketTone } from "../../utils/status";

export function TicketsPage() {
  // Claiming first links tickets that someone else bought for this email.
  const tickets = useRequest(async () => {
    await claimTickets().catch(() => undefined);
    return listTickets();
  }, []);

  return (
    <>
      <PageHeading
        eyebrow="Ready for the door"
        title="My tickets."
        subtitle="Tickets issued to this account. Open one to show its QR code at check-in."
        actions={<Button onClick={tickets.reload}>Refresh</Button>}
      />
      {tickets.loading ? <Loading label="Loading tickets…" /> : null}
      {tickets.error ? <ErrorPanel title="We couldn’t load your tickets." message={tickets.error} onRetry={tickets.reload} /> : null}
      {tickets.data ? (
        tickets.data.length === 0 ? (
          <Panel>
            <EmptyState>
              No tickets yet. <Link to="/discover">Find an event</Link> to register, or sign in with the email a ticket was sent to.
            </EmptyState>
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
                      <Link className="text-button" to={path}>
                        Show QR →
                      </Link>
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
