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
import { t, useLocale } from "@/i18n";

function actorLabel(serviceActor: string | null, actorUserId: string | null): string {
  if (serviceActor) return t("org.system_actor", { p0: serviceActor });
  if (actorUserId) return t("org.user_actor", { p0: actorUserId.slice(0, 8) });
  return t("org.unknown_actor");
}

export function HistoryTab({ event }: { event: EventView }) {
  useLocale();
  const history = useRequest(() => listHistory(event.id), [event.id]);
  const [filter, setFilter] = useState<HistoryFilter>(NO_FILTER);
  const set = (key: keyof HistoryFilter, value: string) => setFilter((current) => ({ ...current, [key]: value }));
  const entries = history.data ? filterHistory(history.data, filter) : [];
  const filtered = Boolean(filter.from || filter.to || filter.group);

  return (
    <Panel>
      <SectionHeading
        title={t("org.activity_history")}
        subtitle={t("org.activity_hint")}
        trailing={<TextButton label={t("common.refresh")} onPress={history.reload} />}
      />
      <View style={[formStyles.inline, { marginBottom: 12 }]} accessibilityLabel={t("org.history_filters")}>
        <DateTimeField dateOnly label={t("org.from")} value={filter.from} onChange={(value) => set("from", value.trim())} />
        <DateTimeField dateOnly label={t("org.to")} value={filter.to} onChange={(value) => set("to", value.trim())} />
        <SelectField
          label={t("org.action_type")}
          value={filter.group}
          options={[{ value: "", label: t("org.all_actions") }, ...actionGroups(history.data ?? []).map((group) => ({ value: group, label: statusLabel(group) }))]}
          onChange={(value) => set("group", value)}
        />
        {filtered ? <SubtleButton label={t("org.clear_filters")} onPress={() => setFilter(NO_FILTER)} /> : null}
      </View>
      {history.loading ? <LoadingState message={t("org.history_loading")} /> : null}
      {history.error ? <ErrorPanel title={t("org.history_error")} message={history.error} onRetry={history.reload} /> : null}
      {history.data && !history.loading ? (
        entries.length === 0 ? (
          <EmptyState message={filtered ? t("org.no_entries") : t("org.nothing_recorded")} />
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
