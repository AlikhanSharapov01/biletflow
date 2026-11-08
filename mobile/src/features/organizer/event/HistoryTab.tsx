import { useState } from "react";
import { View } from "react-native";

import { listHistory } from "@/api/eventAdmin";
import type { EventView } from "@/api/types";
import { EmptyState, ErrorPanel, ListRow, LoadingState, Panel, SelectField, SubtleButton, TextButton } from "@/components/ui";
import { useRequest } from "@/hooks/useRequest";
import { dateLabel, statusLabel } from "@/utils/format";

import { DateTimeField } from "../components/DateTimeField";
import { formStyles } from "../components/formStyles";
import { SectionHeading } from "../components/SectionHeading";
import { NO_FILTER, actionGroups, filterHistory, type HistoryFilter } from "../utils/historyFilter";

function actorLabel(serviceActor: string | null, actorUserId: string | null): string {
  if (serviceActor) return `system (${serviceActor})`;
  if (actorUserId) return `user ${actorUserId.slice(0, 8)}`;
  return "unknown actor";
}

export function HistoryTab({ event }: { event: EventView }) {
  const history = useRequest(() => listHistory(event.id), [event.id]);
  const [filter, setFilter] = useState<HistoryFilter>(NO_FILTER);
  const set = (key: keyof HistoryFilter, value: string) => setFilter((current) => ({ ...current, [key]: value }));
  const entries = history.data ? filterHistory(history.data, filter) : [];
  const filtered = Boolean(filter.from || filter.to || filter.group);

  return (
    <Panel>
      <SectionHeading
        title="Activity history"
        subtitle="Immutable record of changes, publication, staffing and admissions. Shows the latest 100 entries."
        trailing={<TextButton label="Refresh" onPress={history.reload} />}
      />
      <View style={[formStyles.inline, { marginBottom: 12 }]} accessibilityLabel="History filters">
        <DateTimeField dateOnly label="From" value={filter.from} onChange={(value) => set("from", value.trim())} />
        <DateTimeField dateOnly label="To" value={filter.to} onChange={(value) => set("to", value.trim())} />
        <SelectField
          label="Action type"
          value={filter.group}
          options={[{ value: "", label: "All actions" }, ...actionGroups(history.data ?? []).map((group) => ({ value: group, label: statusLabel(group) }))]}
          onChange={(value) => set("group", value)}
        />
        {filtered ? <SubtleButton label="Clear filters" onPress={() => setFilter(NO_FILTER)} /> : null}
      </View>
      {history.loading ? <LoadingState message="Loading history…" /> : null}
      {history.error ? <ErrorPanel title="We couldn’t load the history." message={history.error} onRetry={history.reload} /> : null}
      {history.data && !history.loading ? (
        entries.length === 0 ? (
          <EmptyState message={filtered ? "No entries match these filters." : "Nothing recorded yet."} />
        ) : (
          entries.map((entry) => (
            <ListRow
              key={entry.id}
              title={statusLabel(entry.action)}
              meta={entry.description}
              note={`${dateLabel(entry.created_at)} · ${statusLabel(entry.entity_type)} · ${actorLabel(entry.service_actor, entry.actor_user_id)}`}
            />
          ))
        )
      ) : null}
    </Panel>
  );
}
