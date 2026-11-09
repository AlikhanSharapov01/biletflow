import { t, useLocale } from "../../../i18n";
import { listAttendees } from "../../../api/eventAdmin";
import type { EventView } from "../../../api/types";
import { EmptyState, ErrorPanel, Loading, Panel, PanelHeading, StatusPill } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { dateLabel, seatLabel, statusLabel } from "../../../utils/format";
import { ticketTone } from "../../../utils/status";
import { countByTicketType } from "../utils/attendees";
import { AttendeeActions } from "./attendees/AttendeeActions";

export function AttendeesTab({ event }: { event: EventView }) {
  useLocale();
  const attendees = useRequest(() => listAttendees(event.id), [event.id]);
  const admitted = attendees.data?.filter((row) => row.status === "checked_in").length ?? 0;
  const byType = countByTicketType(attendees.data ?? []);

  return (
    <Panel>
      <PanelHeading
        title={t("organizer.attendees")}
        subtitle={t("org.attendees_hint")}
        trailing={
          <StatusPill tone="neutral">
            {attendees.data?.length ?? 0}{" "}{t("org.issued_suffix")}{" "}{admitted}{" "}{t("org.checked_in_lower")}</StatusPill>
        }
      />
      {byType.length > 1 ? (
        <ul className="type-counts" aria-label={t("org.ticket_type_counts")}>
          {byType.map((type) => (
            <li key={type.ticketTypeId}>
              <strong>{type.name}</strong>
              <span>
                {type.issued}{" "}{t("org.issued_suffix")}{" "}{type.checkedIn}{" "}{t("org.checked_in_lower")}{type.cancelled ? (" " + t("org.cancelled_count", { p0: type.cancelled })) : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {attendees.loading ? <Loading label={t("org.loading_attendees")} /> : null}
      {attendees.error ? <ErrorPanel title={t("org.attendees_error")} message={attendees.error} onRetry={attendees.reload} /> : null}
      {attendees.data ? (
        attendees.data.length === 0 ? (
          <EmptyState>{t("org.no_tickets_issued")}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t("person.name")}</th>
                  <th scope="col">{t("common.email")}</th>
                  <th scope="col">{t("common.ticket")}</th>
                  <th scope="col">{t("org.seat")}</th>
                  <th scope="col">{t("common.status")}</th>
                  <th scope="col">{t("org.claimed")}</th>
                  <th scope="col">{t("org.issued")}</th>
                  <th scope="col">
                    <span className="visually-hidden">{t("common.actions")}</span>
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
                    <td>{row.claimed ? t("common.yes") : t("account.not_yet")}</td>
                    <td>{dateLabel(row.issued_at)}</td>
                    <td>
                      <AttendeeActions eventId={event.id} row={row} onDone={attendees.reload} />
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
