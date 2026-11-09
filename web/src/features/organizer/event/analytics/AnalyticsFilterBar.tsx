import { t, useLocale } from "../../../../i18n";
import { useState, type FormEvent } from "react";
import type { TicketType } from "../../../../api/types";
import type { AnalyticsFilters, SeriesBucket } from "../../../../api/types/analytics";
import { Button, FormMessage, SelectField, TextField } from "../../../../components/ui";

interface AnalyticsFilterBarProps {
  types: TicketType[];
  campaigns: Array<{ id: string; name: string }>;
  bucket: SeriesBucket;
  disabled?: boolean;
  onApply: (filters: AnalyticsFilters, bucket: SeriesBucket) => void;
}

// One row of filters above the charts; applied together.
export function AnalyticsFilterBar({ types, campaigns, bucket, disabled = false, onApply }: AnalyticsFilterBarProps) {
  useLocale();
  const [draft, setDraft] = useState<AnalyticsFilters>({});
  const [draftBucket, setDraftBucket] = useState<SeriesBucket>(bucket);
  const [message, setMessage] = useState("");
  const set = <K extends keyof AnalyticsFilters>(key: K, value: AnalyticsFilters[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft.from && draft.to && draft.to < draft.from) {
      setMessage(t("org.invalid_range"));
      return;
    }
    setMessage("");
    onApply(draft, draftBucket);
  };

  return (
    <form className="filter-bar" onSubmit={submit} aria-label={t("org.analytics_filters")}>
      <fieldset className="plain-fieldset filter-fields" disabled={disabled}>
        <TextField label={t("org.from")} type="datetime-local" value={draft.from ?? ""} onChange={(e) => set("from", e.target.value)} />
        <TextField label={t("org.to")} type="datetime-local" value={draft.to ?? ""} onChange={(e) => set("to", e.target.value)} />
        <SelectField label={t("org.ticket_type")} value={draft.ticket_type_id ?? ""} onChange={(e) => set("ticket_type_id", e.target.value)}>
          <option value="">{t("organizer.all_types")}</option>
          {types.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </SelectField>
        <SelectField label={t("org.campaign")} value={draft.campaign_id ?? ""} onChange={(e) => set("campaign_id", e.target.value)}>
          <option value="">{t("org.all_sales")}</option>
          {campaigns.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>
              {campaign.name}
            </option>
          ))}
        </SelectField>
        <SelectField label={t("org.group_by")} value={draftBucket} onChange={(e) => setDraftBucket(e.target.value as SeriesBucket)}>
          <option value="day">{t("org.day")}</option>
          <option value="hour">{t("org.hour")}</option>
        </SelectField>
        <div className="filter-actions">
          <Button variant="primary" size="sm" type="submit">{t("common.apply")}</Button>
        </div>
      </fieldset>
      <FormMessage message={message} />
    </form>
  );
}
