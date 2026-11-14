import { useState } from "react";

import { listSyncConflicts } from "@/api/admissionHistory";
import type { EventView } from "@/api/types";
import type { SyncConflict } from "@/api/types/admission";
import { EmptyState, ErrorPanel, ListRow, LoadingState, Panel, SegmentedTabs, StatusPill, TextButton } from "@/components/ui";
import { useRequest } from "@/hooks/useRequest";
import { dateLabel, statusLabel } from "@/utils/format";

import { SectionHeading } from "../../components/SectionHeading";
import { ConflictResolveForm } from "./ConflictResolveForm";
import { t, useLocale } from "@/i18n";

type ConflictView = "open" | "resolved";

function conflictNote(conflict: SyncConflict): string {
  if (conflict.status === "resolved") return t("org.resolved_meta", { p0: dateLabel(conflict.resolved_at), p1: conflict.resolution_note ?? "" });
  const existing = conflict.existing_check_in;
  if (!existing) return t("org.no_existing_admission");
  return t("org.already_admitted", { p0: dateLabel(existing.accepted_at), p1: statusLabel(existing.source), p2: existing.reversed_at ? ` ${t("org.since_reversed")}` : "" });
}

// Offline uploads that ran into an existing admission or a refunded ticket.
// Resolving records the gate outcome; it never adds a second entry.
export function SyncConflictsPanel({ event, onResolved }: { event: EventView; onResolved: () => void }) {
  useLocale();
  const [view, setView] = useState<ConflictView>("open");
  const [openId, setOpenId] = useState("");
  const conflicts = useRequest(() => listSyncConflicts(event.id, view), [event.id, view]);

  const resolved = () => {
    setOpenId("");
    conflicts.reload();
    onResolved();
  };

  return (
    <Panel>
      <SectionHeading
        title={t("org.offline_conflicts")}
        subtitle={t("org.offline_conflicts_hint")}
        trailing={view === "open" ? <StatusPill tone={conflicts.data?.length ? "pending" : "positive"} label={t("mobile.org.open_count", { p0: conflicts.data?.length ?? 0 })} /> : null}
      />
      <SegmentedTabs
        fill
        items={[
          { id: "open", label: t("support.open") },
          { id: "resolved", label: t("support.resolved") },
        ]}
        value={view}
        onChange={setView}
      />
      {conflicts.loading ? <LoadingState message={t("org.conflict_loading")} /> : null}
      {conflicts.error ? <ErrorPanel title={t("org.conflict_error")} message={conflicts.error} onRetry={conflicts.reload} /> : null}
      {conflicts.data && !conflicts.loading ? (
        conflicts.data.length === 0 ? (
          <EmptyState message={view === "open" ? t("org.no_open_conflicts") : t("org.no_resolved_conflicts")} />
        ) : (
          conflicts.data.map((conflict) => {
            const op = conflict.operation;
            return (
              <ListRow
                key={conflict.id}
                icon="!"
                title={op.ticket?.attendee_name ?? t("org.unknown_ticket")}
                meta={t("org.scanned_received", { p0: op.ticket?.ticket_type_name ?? t("common.ticket"), p1: op.device.label, p2: dateLabel(op.captured_at_device), p3: dateLabel(op.received_at_server) })}
                note={conflictNote(conflict)}
                trailing={<StatusPill tone={conflict.status === "open" ? "pending" : "neutral"} label={statusLabel(conflict.reason)} />}
              >
                {conflict.status === "open" ? (
                  <TextButton label={openId === conflict.id ? t("common.close") : t("org.resolve")} onPress={() => setOpenId(openId === conflict.id ? "" : conflict.id)} />
                ) : null}
                {openId === conflict.id ? <ConflictResolveForm conflict={conflict} onResolved={resolved} /> : null}
              </ListRow>
            );
          })
        )
      ) : null}
    </Panel>
  );
}
