import { t, useLocale } from "../../../../i18n";
import { useState } from "react";
import { listSyncConflicts } from "../../../../api/admissionHistory";
import type { EventView } from "../../../../api/types";
import { EmptyState, ErrorPanel, ListRow, Loading, Panel, PanelHeading, StatusPill, Tabs } from "../../../../components/ui";
import { useRequest } from "../../../../hooks/useRequest";
import { dateLabel, statusLabel } from "../../../../utils/format";
import { ConflictResolveForm } from "./ConflictResolveForm";

type View = "open" | "resolved";

// Offline uploads that ran into an existing admission or a refunded ticket.
// Resolving records the gate outcome; it never adds a second entry.
export function SyncConflictsPanel({ event, onResolved }: { event: EventView; onResolved: () => void }) {
  useLocale();
  const [view, setView] = useState<View>("open");
  const [openId, setOpenId] = useState("");
  const conflicts = useRequest(() => listSyncConflicts(event.id, view), [event.id, view]);

  const resolved = () => {
    setOpenId("");
    conflicts.reload();
    onResolved();
  };

  return (
    <Panel>
      <PanelHeading
        title={t("org.offline_conflicts")}
        subtitle={t("org.offline_conflicts_hint")}
        trailing={view === "open" ? <StatusPill tone={conflicts.data?.length ? "pending" : "positive"}>{conflicts.data?.length ?? 0}{" "}{t("word.open")}</StatusPill> : null}
      />
      <Tabs
        label={t("org.conflict_status")}
        items={[
          { id: "open", label: t("support.open") },
          { id: "resolved", label: t("support.resolved") },
        ]}
        value={view}
        onChange={setView}
      />
      {conflicts.loading ? <Loading label={t("org.conflict_loading")} /> : null}
      {conflicts.error ? <ErrorPanel title={t("org.conflict_error")} message={conflicts.error} onRetry={conflicts.reload} /> : null}
      {conflicts.data && !conflicts.loading ? (
        conflicts.data.length === 0 ? (
          <EmptyState>{view === "open" ? t("org.no_open_conflicts") : t("org.no_resolved_conflicts")}</EmptyState>
        ) : (
          <div className="list">
            {conflicts.data.map((conflict) => {
              const op = conflict.operation;
              return (
                <ListRow
                  key={conflict.id}
                  icon="!"
                  title={
                    <>
                      {op.ticket?.attendee_name ?? t("org.unknown_ticket")}
                      <StatusPill tone={conflict.status === "open" ? "pending" : "neutral"}>{statusLabel(conflict.reason)}</StatusPill>
                    </>
                  }
                  meta={t("org.scanned_received", { p0: op.ticket?.ticket_type_name ?? t("common.ticket"), p1: op.device.label, p2: dateLabel(op.captured_at_device), p3: dateLabel(op.received_at_server) })}
                  note={
                    conflict.status === "resolved"
                      ? t("org.resolved_meta", { p0: dateLabel(conflict.resolved_at), p1: conflict.resolution_note ?? "" })
                      : conflict.existing_check_in
                        ? t("org.already_admitted", { p0: dateLabel(conflict.existing_check_in.accepted_at), p1: statusLabel(conflict.existing_check_in.source), p2: conflict.existing_check_in.reversed_at ? (" " + t("org.since_reversed")) : "" })
                        : t("org.no_existing_admission")
                  }
                  actions={
                    conflict.status === "open" ? (
                      <button type="button" className="text-button" onClick={() => setOpenId(openId === conflict.id ? "" : conflict.id)}>
                        {openId === conflict.id ? t("common.close") : t("org.resolve")}
                      </button>
                    ) : null
                  }
                >
                  {openId === conflict.id ? <ConflictResolveForm conflict={conflict} onResolved={resolved} /> : null}
                </ListRow>
              );
            })}
          </div>
        )
      ) : null}
    </Panel>
  );
}
