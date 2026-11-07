import { useState } from "react";
import { listAttendees } from "../../../api/eventAdmin";
import type { EventView } from "../../../api/types";
import { EmptyState, ErrorPanel, Loading, NotAvailableYet, Panel, PanelHeading, StatusPill } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { dateLabel, seatLabel, statusLabel } from "../../../utils/format";
import { ticketTone } from "../../../utils/status";
import { countByTicketType } from "../utils/attendees";
import { AttendeeActions } from "./attendees/AttendeeActions";

export function AttendeesTab({ event }: { event: EventView }) {
  const attendees = useRequest(() => listAttendees(event.id), [event.id]);
  const [planned, setPlanned] = useState(false);
  const admitted = attendees.data?.filter((row) => row.status === "checked_in").length ?? 0;
  const byType = countByTicketType(attendees.data ?? []);

  return (
    <Panel>
      <PanelHeading
        title="Attendees"
        subtitle="Issued tickets for this event. Check-ins arrive from the scanner app."
        trailing={
          <StatusPill tone="neutral">
            {attendees.data?.length ?? 0} issued · {admitted} checked in
          </StatusPill>
        }
      />
      {byType.length > 1 ? (
        <ul className="type-counts" aria-label="Tickets per ticket type">
          {byType.map((type) => (
            <li key={type.ticketTypeId}>
              <strong>{type.name}</strong>
              <span>
                {type.issued} issued · {type.checkedIn} checked in{type.cancelled ? ` · ${type.cancelled} cancelled or refunded` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {planned ? (
        <NotAvailableYet feature="Cancelling registrations and refunds">
          The buttons are ready; the server side for cancellations and refunds has not been released yet, so nothing was changed.
        </NotAvailableYet>
      ) : null}
      {attendees.loading ? <Loading label="Loading attendees…" /> : null}
      {attendees.error ? <ErrorPanel title="We couldn’t load attendees." message={attendees.error} onRetry={attendees.reload} /> : null}
      {attendees.data ? (
        attendees.data.length === 0 ? (
          <EmptyState>No tickets issued yet.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Ticket</th>
                  <th scope="col">Seat</th>
                  <th scope="col">Status</th>
                  <th scope="col">Claimed</th>
                  <th scope="col">Issued</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {attendees.data.map((row) => (
                  <tr key={row.ticket_id}>
                    <td>{row.recipient_name}</td>
                    <td>{row.recipient_email}</td>
                    <td>{row.ticket_type_name}</td>
                    <td>{row.seat_snapshot ? seatLabel(row.seat_snapshot) : "—"}</td>
                    <td>
                      <StatusPill tone={ticketTone(row.status)}>{statusLabel(row.status)}</StatusPill>
                    </td>
                    <td>{row.claimed ? "Yes" : "Not yet"}</td>
                    <td>{dateLabel(row.issued_at)}</td>
                    <td>
                      <AttendeeActions eventId={event.id} row={row} onDone={attendees.reload} onPlanned={() => setPlanned(true)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </Panel>
  );
}
