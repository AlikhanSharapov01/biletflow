import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { listAttendees } from "@/api/eventAdmin";
import type { EventView } from "@/api/types";
import { EmptyState, ErrorPanel, ListRow, LoadingState, NotAvailableYet, Panel, StatusPill } from "@/components/ui";
import { useRequest } from "@/hooks/useRequest";
import { dateLabel, initials, seatLabel, statusLabel } from "@/utils/format";
import { ticketTone } from "@/utils/status";

import { SectionHeading } from "../components/SectionHeading";
import { countByTicketType } from "../utils/attendees";
import { AttendeeActions } from "./attendees/AttendeeActions";
import { TypeCounts } from "./attendees/TypeCounts";

export function AttendeesTab({ event }: { event: EventView }) {
  const attendees = useRequest(() => listAttendees(event.id), [event.id]);
  const [planned, setPlanned] = useState(false);
  const admitted = attendees.data?.filter((row) => row.status === "checked_in").length ?? 0;
  const byType = countByTicketType(attendees.data ?? []);

  return (
    <Panel>
      <SectionHeading
        title="Attendees"
        subtitle="Issued tickets for this event. Check-ins arrive from the scanner app."
        trailing={<StatusPill tone="neutral" label={`${attendees.data?.length ?? 0} issued · ${admitted} checked in`} />}
      />
      {byType.length > 1 ? <TypeCounts counts={byType} /> : null}
      {planned ? (
        <NotAvailableYet feature="Cancelling registrations and refunds">
          The buttons are ready; the server side for cancellations and refunds has not been released yet, so nothing was changed.
        </NotAvailableYet>
      ) : null}
      {attendees.loading && !attendees.data ? <LoadingState message="Loading attendees…" /> : null}
      {attendees.error ? <ErrorPanel title="We couldn’t load attendees." message={attendees.error} onRetry={attendees.reload} /> : null}
      {attendees.data ? (
        attendees.data.length === 0 ? (
          <EmptyState message="No tickets issued yet." />
        ) : (
          attendees.data.map((row) => (
            <ListRow
              key={row.ticket_id}
              icon={initials(row.recipient_name) || "?"}
              title={row.recipient_name}
              meta={`${row.recipient_email} · ${row.ticket_type_name}`}
              note={`${row.seat_snapshot ? seatLabel(row.seat_snapshot) : "—"} · Claimed: ${row.claimed ? "Yes" : "Not yet"} · Issued ${dateLabel(row.issued_at)}`}
              trailing={<StatusPill tone={ticketTone(row.status)} label={statusLabel(row.status)} />}
            >
              {row.status === "valid" ? (
                <View style={styles.actions}>
                  <AttendeeActions eventId={event.id} row={row} onDone={attendees.reload} onPlanned={() => setPlanned(true)} />
                </View>
              ) : null}
            </ListRow>
          ))
        )
      ) : null}
    </Panel>
  );
}

const styles = StyleSheet.create({
  actions: { paddingLeft: 50 },
});
