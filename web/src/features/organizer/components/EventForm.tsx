import { categoryName, t, useLocale } from "../../../i18n";
import { useState, type FormEvent } from "react";
import type { Category, EventInput, EventView, Venue } from "../../../api/types";
import { Button } from "../../../components/ui/Button";
import { FormMessage } from "../../../components/ui/Feedback";
import { CheckboxField, SelectField, TextAreaField, TextField } from "../../../components/ui/Field";
import { eventFormValues, toEventInput, type EventFormValues } from "../utils/eventForm";
import { SeatingFields } from "./SeatingFields";

interface EventFormProps {
  initial?: EventView;
  categories: Category[];
  venues: Venue[];
  submitLabel: string;
  busy: boolean;
  message: string;
  success?: boolean;
  onSubmit: (input: EventInput) => Promise<void>;
  onInvalid: (error: string) => void;
}

// One form for creating a draft and for editing an existing event. Window
// fields may stay blank; see utils/eventForm.ts for how they are derived.
export function EventForm({ initial, categories, venues, submitLabel, busy, message, success = false, onSubmit, onInvalid }: EventFormProps) {
  useLocale();
  const [values, setValues] = useState<EventFormValues>(() => eventFormValues(initial));
  const update = <K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));
  const dateField = (key: keyof EventFormValues, label: string, required = false) => (
    <TextField label={label} type="datetime-local" value={String(values[key])} onChange={(e) => update(key, e.target.value)} required={required} />
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = toEventInput(values, initial);
    if (!result.ok) {
      onInvalid(result.error);
      return;
    }
    await onSubmit(result.input);
    if (!initial) setValues(eventFormValues());
  };

  return (
    <form className="form-stack" onSubmit={(event) => void handleSubmit(event)}>
      <TextField label={t("org.event_title")} value={values.title} onChange={(e) => update("title", e.target.value)} required maxLength={200} placeholder={t("org.event_name_placeholder")} />
      <TextAreaField label={t("common.description")} value={values.description} onChange={(e) => update("description", e.target.value)} rows={3} maxLength={20000} placeholder={t("org.guests_hint")} />
      <div className="form-grid">
        <SelectField label={t("discover.category")} value={values.category_id} onChange={(e) => update("category_id", e.target.value)} required>
          <option value="">{t("org.choose_category")}</option>
          {categories.map((item) => (
            <option key={item.id} value={item.id}>
              {categoryName(item)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t("event.venue")}
          value={values.venue_id}
          onChange={(e) => setValues((current) => ({ ...current, venue_id: e.target.value, venue_layout_id: "" }))}
          required
        >
          <option value="">{t("org.choose_venue")}</option>
          {venues.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.city}
            </option>
          ))}
        </SelectField>
      </div>
      <SeatingFields
        venueId={values.venue_id}
        mode={values.seating_mode ?? "general"}
        layoutId={values.venue_layout_id ?? ""}
        onModeChange={(mode) => update("seating_mode", mode)}
        onLayoutChange={(layoutId) => update("venue_layout_id", layoutId)}
      />
      <div className="form-grid">
        <SelectField label={t("event.visibility")} value={values.visibility} onChange={(e) => update("visibility", e.target.value as EventFormValues["visibility"])}>
          <option value="public">{t("org.public")}</option>
          <option value="unlisted">{t("org.unlisted")}</option>
          <option value="private">{t("org.private")}</option>
        </SelectField>
        <TextField label={t("event.capacity")} type="number" min={0} max={100000} value={values.capacity} onChange={(e) => update("capacity", e.target.value)} required />
      </div>
      <div className="form-grid">
        {dateField("starts_at", t("org.starts"), true)}
        {dateField("ends_at", t("org.ends"), true)}
      </div>
      <details className="form-details" open={Boolean(initial)}>
        <summary>{t("org.windows")}</summary>
        <p className="form-intro">{t("org.windows_hint")}</p>
        <div className="form-grid">
          {dateField("registration_opens_at", t("org.registration_opens"))}
          {dateField("registration_closes_at", t("org.registration_closes"))}
        </div>
        <div className="form-grid">
          {dateField("admission_opens_at", t("org.admission_opens"))}
          {dateField("admission_closes_at", t("org.admission_closes"))}
        </div>
        <div className="form-grid">
          <CheckboxField label={t("org.refunds_allowed")} checked={values.refund_allowed} onChange={(e) => update("refund_allowed", e.target.checked)} />
          <TextField label={t("org.refund_cutoff")} type="datetime-local" value={values.refund_cutoff_at} onChange={(e) => update("refund_cutoff_at", e.target.value)} disabled={!values.refund_allowed} />
        </div>
        <TextField label={t("org.timezone_iana")} value={values.time_zone} onChange={(e) => update("time_zone", e.target.value)} maxLength={64} placeholder="Asia/Almaty" />
      </details>
      <FormMessage message={message} success={success} />
      <div className="form-actions">
        <Button variant="primary" type="submit" disabled={busy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
