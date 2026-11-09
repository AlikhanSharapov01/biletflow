import { t, useLocale } from "../../../../i18n";
import { useState, type FormEvent } from "react";
import type { TicketType } from "../../../../api/types";
import type { CheckInFilters } from "../../../../api/types/admission";
import { Button, FormMessage, SelectField, TextField } from "../../../../components/ui";

interface CheckInFilterFormProps {
  types: TicketType[];
  initial: CheckInFilters;
  onApply: (filters: CheckInFilters) => void;
}

// Draft filters are applied together, so the log reloads once per change.
export function CheckInFilterForm({ types, initial, onApply }: CheckInFilterFormProps) {
  useLocale();
  const [draft, setDraft] = useState<CheckInFilters>(initial);
  const [message, setMessage] = useState("");
  const set = <K extends keyof CheckInFilters>(key: K, value: CheckInFilters[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const q = draft.q?.trim() ?? "";
    if (q.length === 1) {
      setMessage(t("org.name_search_hint"));
      return;
    }
    if (draft.from && draft.to && draft.to < draft.from) {
      setMessage(t("org.invalid_range"));
      return;
    }
    setMessage("");
    onApply({ ...draft, q });
  };

  const reset = () => {
    setDraft({});
    setMessage("");
    onApply({});
  };

  return (
    <form className="filter-bar" onSubmit={submit} aria-label={t("org.checkin_filters")}>
      <TextField label={t("tickets.attendee")} hint={t("org.name_minimum")} value={draft.q ?? ""} onChange={(e) => set("q", e.target.value)} maxLength={100} />
      <TextField label={t("org.from")} type="datetime-local" value={draft.from ?? ""} onChange={(e) => set("from", e.target.value)} />
      <TextField label={t("org.to")} type="datetime-local" value={draft.to ?? ""} onChange={(e) => set("to", e.target.value)} />
      <SelectField label={t("org.source")} value={draft.source ?? ""} onChange={(e) => set("source", e.target.value as CheckInFilters["source"])}>
        <option value="">{t("org.any_source")}</option>
        <option value="online">{t("org.online_scan")}</option>
        <option value="offline_sync">{t("org.offline_sync")}</option>
      </SelectField>
      <SelectField label={t("org.state")} value={draft.state ?? ""} onChange={(e) => set("state", e.target.value as CheckInFilters["state"])}>
        <option value="">{t("org.any_state")}</option>
        <option value="current">{t("org.admitted")}</option>
        <option value="reversed">{t("tickets.reversed")}</option>
      </SelectField>
      <SelectField label={t("org.ticket_type")} value={draft.ticket_type_id ?? ""} onChange={(e) => set("ticket_type_id", e.target.value)}>
        <option value="">{t("organizer.all_types")}</option>
        {types.map((type) => (
          <option key={type.id} value={type.id}>
            {type.name}
          </option>
        ))}
      </SelectField>
      <div className="filter-actions">
        <Button variant="primary" size="sm" type="submit">{t("common.apply")}</Button>
        <Button size="sm" onClick={reset}>{t("common.reset")}</Button>
      </div>
      <FormMessage message={message} />
    </form>
  );
}
