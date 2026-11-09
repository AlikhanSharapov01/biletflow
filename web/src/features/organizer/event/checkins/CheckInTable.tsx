import { t, useLocale } from "../../../../i18n";
import type { CheckInRecord } from "../../../../api/types/admission";
import { StatusPill } from "../../../../components/ui";
import { dateLabel, seatLabel } from "../../../../utils/format";

export function CheckInTable({ rows }: { rows: CheckInRecord[] }) {
  useLocale();
  return (
    <div className="table-wrap">
      <table className="data-table">
        <caption className="visually-hidden">{t("organizer.check_ins")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("tickets.attendee")}</th>
            <th scope="col">{t("common.ticket")}</th>
            <th scope="col">{t("org.admitted")}</th>
            <th scope="col">{t("org.source")}</th>
            <th scope="col">{t("account.scanner")}</th>
            <th scope="col">{t("org.state")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.check_in_id}>
              <td>
                <strong>{row.attendee_name}</strong>
                <small className="cell-note">{row.seat ? seatLabel(row.seat) : t("checkout.general_admission")}</small>
              </td>
              <td>{row.ticket_type_name}</td>
              <td>
                {dateLabel(row.accepted_at)}
                {row.source === "offline_sync" && row.captured_at ? <small className="cell-note">{t("org.scanned")}{" "}{dateLabel(row.captured_at)}{" "}{t("org.device_time")}</small> : null}
              </td>
              <td>{row.source === "online" ? t("org.online") : t("org.offline_sync")}</td>
              <td>
                {row.scanner?.display_name ?? "—"}
                {row.device_label ? <small className="cell-note">{row.device_label}</small> : null}
              </td>
              <td>
                {row.reversed_at ? (
                  <>
                    <StatusPill tone="blocked">{t("tickets.reversed")}</StatusPill>
                    <small className="cell-note">
                      {row.reversal?.reason ?? ""}
                      {row.reversal?.actor ? ` · ${row.reversal.actor.display_name}` : ""} · {dateLabel(row.reversed_at)}
                    </small>
                  </>
                ) : (
                  <StatusPill>{t("org.admitted")}</StatusPill>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
