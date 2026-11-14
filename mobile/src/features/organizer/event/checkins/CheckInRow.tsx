import type { CheckInRecord } from "@/api/types/admission";
import { ListRow, StatusPill } from "@/components/ui";
import { dateLabel, seatLabel } from "@/utils/format";
import { t, useLocale } from "@/i18n";

export function CheckInRow({ row }: { row: CheckInRecord }) {
  useLocale();
  const scanned = row.source === "offline_sync" && row.captured_at ? t("mobile.org.scanned_device_time", { p0: dateLabel(row.captured_at) }) : "";
  const scanner = `${row.scanner?.display_name ?? "—"}${row.device_label ? ` · ${row.device_label}` : ""}`;
  const reversal = row.reversed_at
    ? t("mobile.org.reversed_meta", { p0: row.reversal?.reason ?? "", p1: row.reversal?.actor ? ` · ${row.reversal.actor.display_name}` : "", p2: dateLabel(row.reversed_at) })
    : "";
  return (
    <ListRow
      icon={row.source === "online" ? "✓" : "↺"}
      title={row.attendee_name}
      meta={`${row.ticket_type_name} · ${row.seat ? seatLabel(row.seat) : t("checkout.general_admission")}`}
      note={t("mobile.org.admitted_meta", { p0: dateLabel(row.accepted_at), p1: scanned, p2: row.source === "online" ? t("org.online") : t("org.offline_sync"), p3: scanner, p4: reversal })}
      trailing={row.reversed_at ? <StatusPill tone="blocked" label={t("tickets.reversed")} /> : <StatusPill label={t("org.admitted")} />}
    />
  );
}
