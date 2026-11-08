import { useState } from "react";

import { listSyncConflicts } from "@/api/admissionHistory";
import type { EventView } from "@/api/types";
import type { SyncConflict } from "@/api/types/admission";
import { EmptyState, ErrorPanel, ListRow, LoadingState, Panel, SegmentedTabs, StatusPill, TextButton } from "@/components/ui";
import { useRequest } from "@/hooks/useRequest";
import { dateLabel, statusLabel } from "@/utils/format";

import { SectionHeading } from "../../components/SectionHeading";
import { ConflictResolveForm } from "./ConflictResolveForm";

type ConflictView = "open" | "resolved";

function conflictNote(conflict: SyncConflict): string {
  if (conflict.status === "resolved") return `Resolved ${dateLabel(conflict.resolved_at)}: ${conflict.resolution_note ?? ""}`;
  const existing = conflict.existing_check_in;
  if (!existing) return "No existing admission";
  return `Already admitted ${dateLabel(existing.accepted_at)} via ${statusLabel(existing.source)}${existing.reversed_at ? " (since reversed)" : ""}`;
}

// Offline uploads that ran into an existing admission or a refunded ticket.
// Resolving records the gate outcome; it never adds a second entry.
export function SyncConflictsPanel({ event, onResolved }: { event: EventView; onResolved: () => void }) {
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
        title="Offline sync conflicts"
        subtitle="Scans made offline that clashed with another admission or a cancelled ticket."
        trailing={view === "open" ? <StatusPill tone={conflicts.data?.length ? "pending" : "positive"} label={`${conflicts.data?.length ?? 0} open`} /> : null}
      />
      <SegmentedTabs
        fill
        items={[
          { id: "open", label: "Open" },
          { id: "resolved", label: "Resolved" },
        ]}
        value={view}
        onChange={setView}
      />
      {conflicts.loading ? <LoadingState message="Loading conflicts…" /> : null}
      {conflicts.error ? <ErrorPanel title="We couldn’t load conflicts." message={conflicts.error} onRetry={conflicts.reload} /> : null}
      {conflicts.data && !conflicts.loading ? (
        conflicts.data.length === 0 ? (
          <EmptyState message={view === "open" ? "No open conflicts. Offline scans all synced cleanly." : "No resolved conflicts yet."} />
        ) : (
          conflicts.data.map((conflict) => {
            const op = conflict.operation;
            return (
              <ListRow
                key={conflict.id}
                icon="!"
                title={op.ticket?.attendee_name ?? "Unknown ticket"}
                meta={`${op.ticket?.ticket_type_name ?? "Ticket"} · ${op.device.label} · scanned ${dateLabel(op.captured_at_device)} (device) · received ${dateLabel(op.received_at_server)}`}
                note={conflictNote(conflict)}
                trailing={<StatusPill tone={conflict.status === "open" ? "pending" : "neutral"} label={statusLabel(conflict.reason)} />}
              >
                {conflict.status === "open" ? (
                  <TextButton label={openId === conflict.id ? "Close" : "Resolve"} onPress={() => setOpenId(openId === conflict.id ? "" : conflict.id)} />
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
