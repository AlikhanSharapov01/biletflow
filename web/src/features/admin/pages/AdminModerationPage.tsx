import { useState } from "react";
import { listModerationActions } from "../../../api/admin";
import { Button, EmptyState, ErrorPanel, Loading, Panel, PanelHeading } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { dateLabel, statusLabel } from "../../../utils/format";

const LIMIT = 50;

// Append-only record of every suspend / reinstate decision, newest first.
export function AdminModerationPage() {
  const [offset, setOffset] = useState(0);
  const log = useRequest(() => listModerationActions(LIMIT, offset), [offset]);

  return (
    <Panel>
      <PanelHeading title="Moderation log" subtitle="Every suspension and reinstatement with its actor and reason. Entries cannot be edited." />
      {log.loading ? <Loading label="Loading moderation log…" /> : null}
      {log.error ? <ErrorPanel title="We couldn’t load the moderation log." message={log.error} onRetry={log.reload} /> : null}
      {log.data && !log.loading ? (
        log.data.length === 0 ? (
          <EmptyState>No moderation decisions yet.</EmptyState>
        ) : (
          <ol className="timeline">
            {log.data.map((entry) => (
              <li key={entry.id}>
                <time dateTime={entry.created_at}>{dateLabel(entry.created_at)}</time>
                <div>
                  <strong>{statusLabel(entry.action)}</strong>
                  <span>{entry.reason}</span>
                  <small>
                    {entry.target_user_id ? `User ${entry.target_user_id}` : `Event ${entry.target_event_id ?? "unknown"}`} · by admin {entry.actor_user_id.slice(0, 8)}
                  </small>
                </div>
              </li>
            ))}
          </ol>
        )
      ) : null}
      <nav className="pagination" aria-label="Moderation log pages">
        <Button size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>
          Newer
        </Button>
        <Button size="sm" disabled={(log.data?.length ?? 0) < LIMIT} onClick={() => setOffset(offset + LIMIT)}>
          Older
        </Button>
      </nav>
    </Panel>
  );
}
