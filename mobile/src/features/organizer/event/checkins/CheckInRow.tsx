import type { CheckInRecord } from "@/api/types/admission";
import { ListRow, StatusPill } from "@/components/ui";
import { dateLabel, seatLabel } from "@/utils/format";

export function CheckInRow({ row }: { row: CheckInRecord }) {
  const scanned = row.source === "offline_sync" && row.captured_at ? ` · scanned ${dateLabel(row.captured_at)} (device time)` : "";
  const scanner = `${row.scanner?.display_name ?? "—"}${row.device_label ? ` · ${row.device_label}` : ""}`;
  const reversal = row.reversed_at
    ? ` · Reversed: ${row.reversal?.reason ?? ""}${row.reversal?.actor ? ` · ${row.reversal.actor.display_name}` : ""} · ${dateLabel(row.reversed_at)}`
    : "";
  return (
    <ListRow
      icon={row.source === "online" ? "✓" : "↺"}
      title={row.attendee_name}
      meta={`${row.ticket_type_name} · ${row.seat ? seatLabel(row.seat) : "General admission"}`}
      note={`Admitted ${dateLabel(row.accepted_at)}${scanned} · ${row.source === "online" ? "Online" : "Offline sync"} · ${scanner}${reversal}`}
      trailing={row.reversed_at ? <StatusPill tone="blocked" label="Reversed" /> : <StatusPill label="Admitted" />}
    />
  );
}
