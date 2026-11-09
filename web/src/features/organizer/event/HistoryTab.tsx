import { t, translate, useLocale } from "../../../i18n";
import { useState } from "react";
import { listHistory } from "../../../api/eventAdmin";
import type { EventView } from "../../../api/types";
import { Button, EmptyState, ErrorPanel, Loading, Panel, PanelHeading, SelectField, TextField } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { dateLabel, statusLabel } from "../../../utils/format";
import { NO_FILTER, actionGroups, filterHistory, type HistoryFilter } from "../utils/historyFilter";

export function HistoryTab({ event }: { event: EventView }) {
  useLocale();
  const history = useRequest(() => listHistory(event.id), [event.id]);
  const [filter, setFilter] = useState<HistoryFilter>(NO_FILTER);
  const set = (key: keyof HistoryFilter, value: string) => setFilter((current) => ({ ...current, [key]: value }));
  const entries = history.data ? filterHistory(history.data, filter) : [];
  const filtered = filter.from || filter.to || filter.group;

  return (
    <Panel>
      <PanelHeading
        title={t("org.activity_history")}
        subtitle={t("org.activity_hint")}
        trailing={
          <Button variant="text" onClick={history.reload}>{t("common.refresh")}</Button>
        }
      />
      <div className="filter-bar" role="search" aria-label={t("org.history_filters")}>
        <TextField label={t("org.from")} type="date" value={filter.from} onChange={(e) => set("from", e.target.value)} />
        <TextField label={t("org.to")} type="date" value={filter.to} onChange={(e) => set("to", e.target.value)} />
        <SelectField label={t("org.action_type")} value={filter.group} onChange={(e) => set("group", e.target.value)}>
          <option value="">{t("org.all_actions")}</option>
          {actionGroups(history.data ?? []).map((group) => (
            <option key={group} value={group}>
              {statusLabel(group)}
            </option>
          ))}
        </SelectField>
        {filtered ? (
          <div className="filter-actions">
            <Button size="sm" onClick={() => setFilter(NO_FILTER)}>{t("org.clear_filters")}</Button>
          </div>
        ) : null}
      </div>
      {history.loading ? <Loading label={t("org.history_loading")} /> : null}
      {history.error ? <ErrorPanel title={t("org.history_error")} message={history.error} onRetry={history.reload} /> : null}
      {history.data ? (
        entries.length === 0 ? (
          <EmptyState>{filtered ? t("org.no_entries") : t("org.nothing_recorded")}</EmptyState>
        ) : (
          <ol className="timeline">
            {entries.map((entry) => (
              <li key={entry.id}>
                <time dateTime={entry.created_at}>{dateLabel(entry.created_at)}</time>
                <div>
                  <strong>{statusLabel(entry.action)}</strong>
                  <span>{entry.description === entry.action ? statusLabel(entry.action) : translate(entry.description)}</span>
                  <small>
                    {statusLabel(entry.entity_type)} ·{" "}
                    {entry.service_actor ? t("org.system_actor", { p0: entry.service_actor }) : entry.actor_user_id ? t("org.user_actor", { p0: entry.actor_user_id.slice(0, 8) }) : t("org.unknown_actor")}
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
