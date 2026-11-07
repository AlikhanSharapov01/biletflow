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
        title="Offline sync conflicts"
        subtitle="Scans made offline that clashed with another admission or a cancelled ticket."
        trailing={view === "open" ? <StatusPill tone={conflicts.data?.length ? "pending" : "positive"}>{conflicts.data?.length ?? 0} open</StatusPill> : null}
      />
      <Tabs
        label="Conflict status"
        items={[
          { id: "open", label: "Open" },
          { id: "resolved", label: "Resolved" },
        ]}
        value={view}
        onChange={setView}
      />
      {conflicts.loading ? <Loading label="Loading conflicts…" /> : null}
      {conflicts.error ? <ErrorPanel title="We couldn’t load conflicts." message={conflicts.error} onRetry={conflicts.reload} /> : null}
      {conflicts.data && !conflicts.loading ? (
        conflicts.data.length === 0 ? (
          <EmptyState>{view === "open" ? "No open conflicts. Offline scans all synced cleanly." : "No resolved conflicts yet."}</EmptyState>
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
                      {op.ticket?.attendee_name ?? "Unknown ticket"}
                      <StatusPill tone={conflict.status === "open" ? "pending" : "neutral"}>{statusLabel(conflict.reason)}</StatusPill>
                    </>
                  }
                  meta={`${op.ticket?.ticket_type_name ?? "Ticket"} · ${op.device.label} · scanned ${dateLabel(op.captured_at_device)} (device) · received ${dateLabel(op.received_at_server)}`}
                  note={
                    conflict.status === "resolved"
                      ? `Resolved ${dateLabel(conflict.resolved_at)}: ${conflict.resolution_note ?? ""}`
                      : conflict.existing_check_in
                        ? `Already admitted ${dateLabel(conflict.existing_check_in.accepted_at)} via ${statusLabel(conflict.existing_check_in.source)}${conflict.existing_check_in.reversed_at ? " (since reversed)" : ""}`
                        : "No existing admission"
                  }
                  actions={
                    conflict.status === "open" ? (
                      <button type="button" className="text-button" onClick={() => setOpenId(openId === conflict.id ? "" : conflict.id)}>
                        {openId === conflict.id ? "Close" : "Resolve"}
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
