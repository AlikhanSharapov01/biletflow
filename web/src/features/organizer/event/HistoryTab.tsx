import { useState } from "react";
import { listHistory } from "../../../api/eventAdmin";
import type { EventView } from "../../../api/types";
import { Button, EmptyState, ErrorPanel, Loading, Panel, PanelHeading, SelectField, TextField } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { dateLabel, statusLabel } from "../../../utils/format";
import { NO_FILTER, actionGroups, filterHistory, type HistoryFilter } from "../utils/historyFilter";

export function HistoryTab({ event }: { event: EventView }) {
  const history = useRequest(() => listHistory(event.id), [event.id]);
  const [filter, setFilter] = useState<HistoryFilter>(NO_FILTER);
  const set = (key: keyof HistoryFilter, value: string) => setFilter((current) => ({ ...current, [key]: value }));
  const entries = history.data ? filterHistory(history.data, filter) : [];
  const filtered = filter.from || filter.to || filter.group;

  return (
    <Panel>
      <PanelHeading
        title="Activity history"
        subtitle="Immutable record of changes, publication, staffing and admissions. Shows the latest 100 entries."
        trailing={
          <Button variant="text" onClick={history.reload}>
            Refresh
          </Button>
        }
      />
      <div className="filter-bar" role="search" aria-label="History filters">
        <TextField label="From" type="date" value={filter.from} onChange={(e) => set("from", e.target.value)} />
        <TextField label="To" type="date" value={filter.to} onChange={(e) => set("to", e.target.value)} />
        <SelectField label="Action type" value={filter.group} onChange={(e) => set("group", e.target.value)}>
          <option value="">All actions</option>
          {actionGroups(history.data ?? []).map((group) => (
            <option key={group} value={group}>
              {statusLabel(group)}
            </option>
          ))}
        </SelectField>
        {filtered ? (
          <div className="filter-actions">
            <Button size="sm" onClick={() => setFilter(NO_FILTER)}>
              Clear filters
            </Button>
          </div>
        ) : null}
      </div>
      {history.loading ? <Loading label="Loading history…" /> : null}
      {history.error ? <ErrorPanel title="We couldn’t load the history." message={history.error} onRetry={history.reload} /> : null}
      {history.data ? (
        entries.length === 0 ? (
          <EmptyState>{filtered ? "No entries match these filters." : "Nothing recorded yet."}</EmptyState>
        ) : (
          <ol className="timeline">
            {entries.map((entry) => (
              <li key={entry.id}>
                <time dateTime={entry.created_at}>{dateLabel(entry.created_at)}</time>
                <div>
                  <strong>{statusLabel(entry.action)}</strong>
                  <span>{entry.description}</span>
                  <small>
                    {statusLabel(entry.entity_type)} ·{" "}
                    {entry.service_actor ? `system (${entry.service_actor})` : entry.actor_user_id ? `user ${entry.actor_user_id.slice(0, 8)}` : "unknown actor"}
                  </small>
                </div>
              </li>
            ))}
          </ol>
        )
      ) : null}
    </Panel>
  );
}
