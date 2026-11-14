import { StyleSheet, View } from "react-native";

import { listAttendees } from "@/api/eventAdmin";
import type { EventView } from "@/api/types";
import { EmptyState, ErrorPanel, ListRow, LoadingState, Panel, StatusPill } from "@/components/ui";
import { useRequest } from "@/hooks/useRequest";
import { dateLabel, initials, seatLabel, statusLabel } from "@/utils/format";
import { ticketTone } from "@/utils/status";

import { SectionHeading } from "../components/SectionHeading";
import { countByTicketType } from "../utils/attendees";
import { AttendeeActions } from "./attendees/AttendeeActions";
import { TypeCounts } from "./attendees/TypeCounts";
import { t, useLocale } from "@/i18n";

export function AttendeesTab({ event }: { event: EventView }) {
  useLocale();
  const attendees = useRequest(() => listAttendees(event.id), [event.id]);
  const admitted = attendees.data?.filter((row) => row.status === "checked_in").length ?? 0;
  const byType = countByTicketType(attendees.data ?? []);

  return (
    <Panel>
      <SectionHeading
        title={t("organizer.attendees")}
        subtitle={t("org.attendees_hint")}
        trailing={<StatusPill tone="neutral" label={t("mobile.org.attendee_counts", { p0: attendees.data?.length ?? 0, p1: admitted })} />}
      />
      {byType.length > 1 ? <TypeCounts counts={byType} /> : null}
      {attendees.loading && !attendees.data ? <LoadingState message={t("org.loading_attendees")} /> : null}
      {attendees.error ? <ErrorPanel title={t("org.attendees_error")} message={attendees.error} onRetry={attendees.reload} /> : null}
      {attendees.data ? (
        attendees.data.length === 0 ? (
          <EmptyState message={t("org.no_tickets_issued")} />
        ) : (
          attendees.data.map((row) => (
            <ListRow
              key={row.ticket_id}
              icon={initials(row.recipient_name) || "?"}
              title={row.recipient_name}
              meta={`${row.recipient_email} · ${row.ticket_type_name}`}
              note={t("mobile.org.attendee_note", { p0: row.seat_snapshot ? seatLabel(row.seat_snapshot) : "—", p1: row.claimed ? t("common.yes") : t("account.not_yet"), p2: dateLabel(row.issued_at) })}
              trailing={<StatusPill tone={ticketTone(row.status)} label={statusLabel(row.status)} />}
            >
              {row.status === "valid" ? (
                <View style={styles.actions}>
                  <AttendeeActions eventId={event.id} row={row} onDone={attendees.reload} />
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
