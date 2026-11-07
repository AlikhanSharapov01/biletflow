import type { CheckInRecord } from "../../../../api/types/admission";
import { StatusPill } from "../../../../components/ui";
import { dateLabel, seatLabel } from "../../../../utils/format";

export function CheckInTable({ rows }: { rows: CheckInRecord[] }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <caption className="visually-hidden">Check-ins</caption>
        <thead>
          <tr>
            <th scope="col">Attendee</th>
            <th scope="col">Ticket</th>
            <th scope="col">Admitted</th>
            <th scope="col">Source</th>
            <th scope="col">Scanner</th>
            <th scope="col">State</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.check_in_id}>
              <td>
                <strong>{row.attendee_name}</strong>
                <small className="cell-note">{row.seat ? seatLabel(row.seat) : "General admission"}</small>
              </td>
              <td>{row.ticket_type_name}</td>
              <td>
                {dateLabel(row.accepted_at)}
                {row.source === "offline_sync" && row.captured_at ? <small className="cell-note">Scanned {dateLabel(row.captured_at)} (device time)</small> : null}
              </td>
              <td>{row.source === "online" ? "Online" : "Offline sync"}</td>
              <td>
                {row.scanner?.display_name ?? "—"}
                {row.device_label ? <small className="cell-note">{row.device_label}</small> : null}
              </td>
              <td>
                {row.reversed_at ? (
                  <>
                    <StatusPill tone="blocked">Reversed</StatusPill>
                    <small className="cell-note">
                      {row.reversal?.reason ?? ""}
                      {row.reversal?.actor ? ` · ${row.reversal.actor.display_name}` : ""} · {dateLabel(row.reversed_at)}
                    </small>
                  </>
                ) : (
                  <StatusPill>Admitted</StatusPill>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
