import { useState } from "react";
import { View } from "react-native";

import type { Category, EventInput, EventView, Venue } from "@/api/types";
import { PrimaryButton, SelectField, TextButton, TextField } from "@/components/ui";

import { eventFormValues, toEventInput, type EventFormValues } from "../utils/eventForm";
import { CheckboxField } from "./CheckboxField";
import { DateTimeField } from "./DateTimeField";
import { FormMessage } from "@/components/ui/FormMessage";
import { formStyles } from "./formStyles";
import { Intro } from "./Intro";
import { SeatingFields } from "./SeatingFields";
import { categoryName, t, useLocale } from "@/i18n";

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

const VISIBILITY = [
  { value: "public", get label() { return t("org.public"); } },
  { value: "unlisted", get label() { return t("org.unlisted"); } },
  { value: "private", get label() { return t("org.private"); } },
];

// One form for creating a draft and for editing an existing event. Window
// fields may stay blank; see utils/eventForm.ts for how they are derived.
export function EventForm({ initial, categories, venues, submitLabel, busy, message, success = false, onSubmit, onInvalid }: EventFormProps) {
  useLocale();
  const [values, setValues] = useState<EventFormValues>(() => eventFormValues(initial));
  const [windowsOpen, setWindowsOpen] = useState(Boolean(initial));
  const update = <K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));
  const dateField = (key: keyof EventFormValues, label: string) => (
    <DateTimeField label={label} value={String(values[key] ?? "")} onChange={(value) => update(key, value)} />
  );

  const submit = async () => {
    const result = toEventInput(values, initial);
    if (!result.ok) {
      onInvalid(result.error);
      return;
    }
    await onSubmit(result.input);
  };

  return (
    <View style={formStyles.stack}>
      <TextField label={t("org.event_title")} value={values.title} onChangeText={(text) => update("title", text)} maxLength={200} placeholder={t("org.event_name_placeholder")} />
      <TextField
        label={t("common.description")}
        value={values.description}
        onChangeText={(text) => update("description", text)}
        multiline
        maxLength={20000}
        placeholder={t("org.guests_hint")}
      />
      <SelectField
        label={t("discover.category")}
        value={values.category_id}
        placeholder={t("org.choose_category")}
        options={categories.map((item) => ({ value: item.id, label: categoryName(item) }))}
        onChange={(value) => update("category_id", value)}
      />
      <SelectField
        label={t("event.venue")}
        value={values.venue_id}
        placeholder={t("org.choose_venue")}
        options={venues.map((item) => ({ value: item.id, label: `${item.name} · ${item.city}` }))}
        onChange={(value) => setValues((current) => ({ ...current, venue_id: value, venue_layout_id: "" }))}
      />
      <SeatingFields
        venueId={values.venue_id}
        mode={values.seating_mode ?? "general"}
        layoutId={values.venue_layout_id ?? ""}
        onModeChange={(mode) => update("seating_mode", mode)}
        onLayoutChange={(layoutId) => update("venue_layout_id", layoutId)}
      />
      <SelectField
        label={t("event.visibility")}
        value={values.visibility}
        options={VISIBILITY}
        onChange={(value) => update("visibility", value as EventFormValues["visibility"])}
      />
      <TextField label={t("event.capacity")} value={values.capacity} onChangeText={(text) => update("capacity", text)} keyboardType="number-pad" maxLength={6} />
      {dateField("starts_at", t("org.starts"))}
      {dateField("ends_at", t("org.ends"))}
      <TextButton
        label={`${windowsOpen ? "▾" : "▸"} ${t("org.windows")}`}
        onPress={() => setWindowsOpen(!windowsOpen)}
      />
      {windowsOpen ? (
        <View style={formStyles.stack}>
          <Intro>{t("org.windows_hint")}</Intro>
          {dateField("registration_opens_at", t("org.registration_opens"))}
          {dateField("registration_closes_at", t("org.registration_closes"))}
          {dateField("admission_opens_at", t("org.admission_opens"))}
          {dateField("admission_closes_at", t("org.admission_closes"))}
          <CheckboxField label={t("org.refunds_allowed")} checked={values.refund_allowed} onChange={(checked) => update("refund_allowed", checked)} />
          <DateTimeField
            label={t("org.refund_cutoff")}
            value={values.refund_cutoff_at}
            onChange={(value) => update("refund_cutoff_at", value)}
            disabled={!values.refund_allowed}
          />
          <TextField
            label={t("org.timezone_iana")}
            value={values.time_zone}
            onChangeText={(text) => update("time_zone", text)}
            maxLength={64}
            placeholder="Asia/Almaty"
            autoCapitalize="none"
          />
        </View>
      ) : null}
      <FormMessage message={message} success={success} />
      <PrimaryButton label={submitLabel} onPress={() => void submit()} loading={busy} />
    </View>
  );
}
