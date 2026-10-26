import { Link, useParams } from "react-router";
import { claimTickets, getTicket, listTickets } from "../api/checkout";
import { EmptyState, ErrorPanel, Loading } from "../components/Feedback";
import { TicketQr } from "../components/TicketQr";
import { useRequest } from "../hooks/useRequest";
import { dateLabel, dayNumber, monthShort, seatLabel, statusLabel } from "../utils/format";

function statusTone(status: string): string {
  if (status === "valid") return "";
  if (status === "checked_in") return "neutral";
  return "blocked";
}

export function TicketsPage() {
  // Claiming first links tickets that someone else bought for this email.
  const tickets = useRequest(async () => {
    await claimTickets().catch(() => undefined);
    return listTickets();
  }, []);

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Ready for the door</p>
          <h1 className="serif">My tickets.</h1>
          <p>Tickets issued to this account. Open one to show its QR code at check-in.</p>
        </div>
        <div className="heading-actions">
          <button className="subtle-button" type="button" onClick={tickets.reload}>
            Refresh
          </button>
        </div>
      </div>
      {tickets.loading ? <Loading label="Loading tickets…" /> : null}
      {tickets.error ? <ErrorPanel title="We couldn’t load your tickets." message={tickets.error} onRetry={tickets.reload} /> : null}
      {tickets.data ? (
        tickets.data.length === 0 ? (
          <section className="panel">
            <EmptyState>
              No tickets yet. <Link to="/discover">Find an event</Link> to register, or sign in with the email a ticket was sent to.
            </EmptyState>
          </section>
        ) : (
          <div className="event-cards ticket-grid">
            {tickets.data.map((ticket) => (
              <article className="discover-card ticket-card" key={ticket.id}>
                <div className="ticket-card-body">
                  <div className="event-date">
                    <b>{dayNumber(ticket.event_starts_at)}</b>
                    <span>{monthShort(ticket.event_starts_at)}</span>
                  </div>
                  <div className="event-copy">
                    <strong>
                      <Link to={`/tickets/${encodeURIComponent(ticket.id)}`}>{ticket.event_title}</Link>
                    </strong>
                    <span>
                      {dateLabel(ticket.event_starts_at)} · {ticket.venue_name}
                    </span>
                    <span>
                      {ticket.ticket_type_name} · {seatLabel(ticket.seat_snapshot)}
                    </span>
                  </div>
                </div>
                <div className="discover-foot">
                  <span className={`status ${statusTone(ticket.status)}`}>{statusLabel(ticket.status)}</span>
                  <Link className="text-button" to={`/tickets/${encodeURIComponent(ticket.id)}`}>
                    Show QR →
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )
      ) : null}
    </>
  );
}

export function TicketPage() {
  const { ticketId = "" } = useParams();
  const ticket = useRequest(() => getTicket(ticketId), [ticketId]);

  if (ticket.loading) return <Loading label="Loading ticket…" />;
  if (ticket.error || !ticket.data) {
    return <ErrorPanel title="We couldn’t load this ticket." message={ticket.error ?? "Unknown error"} onRetry={ticket.reload} />;
  }
  const data = ticket.data;

  return (
    <div className="ticket-page">
      <Link className="back-link" to="/tickets">
        ← All tickets
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Admission ticket</p>
          <h1 className="serif">{data.event_title}</h1>
          <p>
            {dateLabel(data.event_starts_at)} · {data.venue_name}
          </p>
        </div>
        <div className="heading-actions">
          <span className={`status ${statusTone(data.status)}`}>{statusLabel(data.status)}</span>
          <button className="subtle-button" type="button" onClick={() => window.print()}>
            Print ticket
          </button>
        </div>
      </div>
      <section className="panel printable-ticket">
        <div className="printable-ticket-grid">
          <TicketQr payload={data.qr_payload} />
          <div className="printable-ticket-copy">
            <p className="eyebrow">BiletFlow</p>
            <h2>{data.event_title}</h2>
            <ul className="event-facts">
              <li>
                <strong>When</strong>
                {dateLabel(data.event_starts_at)}
              </li>
              <li>
                <strong>Where</strong>
                {data.venue_name}
              </li>
              <li>
                <strong>Ticket</strong>
                {data.ticket_type_name} · {seatLabel(data.seat_snapshot)}
              </li>
              <li>
                <strong>Attendee</strong>
                {data.recipient_name}
              </li>
              <li>
                <strong>Ticket ID</strong>
                <code>{data.id}</code>
              </li>
              <li>
                <strong>Status</strong>
                {statusLabel(data.status)} · issued {dateLabel(data.issued_at)}
              </li>
            </ul>
            <p className="ticket-footnote">
              Present this QR code at the entrance. A printed copy and the on-screen copy share one ticket ID, so only one can be admitted.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
