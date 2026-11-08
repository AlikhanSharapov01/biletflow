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
  { value: "public", label: "Public · listed in discovery" },
  { value: "unlisted", label: "Unlisted · link only" },
  { value: "private", label: "Private · invited accounts" },
];

// One form for creating a draft and for editing an existing event. Window
// fields may stay blank; see utils/eventForm.ts for how they are derived.
export function EventForm({ initial, categories, venues, submitLabel, busy, message, success = false, onSubmit, onInvalid }: EventFormProps) {
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
      <TextField label="Event title" value={values.title} onChangeText={(text) => update("title", text)} maxLength={200} placeholder="Give your event a name" />
      <TextField
        label="Description"
        value={values.description}
        onChangeText={(text) => update("description", text)}
        multiline
        maxLength={20000}
        placeholder="What should guests know?"
      />
      <SelectField
        label="Category"
        value={values.category_id}
        placeholder="Choose category"
        options={categories.map((item) => ({ value: item.id, label: item.name_en }))}
        onChange={(value) => update("category_id", value)}
      />
      <SelectField
        label="Venue"
        value={values.venue_id}
        placeholder="Choose venue"
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
        label="Visibility"
        value={values.visibility}
        options={VISIBILITY}
        onChange={(value) => update("visibility", value as EventFormValues["visibility"])}
      />
      <TextField label="Capacity" value={values.capacity} onChangeText={(text) => update("capacity", text)} keyboardType="number-pad" maxLength={6} />
      {dateField("starts_at", "Starts")}
      {dateField("ends_at", "Ends")}
      <TextButton
        label={`${windowsOpen ? "▾" : "▸"} Registration, admission and refund windows`}
        onPress={() => setWindowsOpen(!windowsOpen)}
      />
      {windowsOpen ? (
        <View style={formStyles.stack}>
          <Intro>Leave a window blank to derive it: registration opens now and closes at the start; admission runs from start to end.</Intro>
          {dateField("registration_opens_at", "Registration opens")}
          {dateField("registration_closes_at", "Registration closes")}
          {dateField("admission_opens_at", "Admission opens")}
          {dateField("admission_closes_at", "Admission closes")}
          <CheckboxField label="Refunds allowed" checked={values.refund_allowed} onChange={(checked) => update("refund_allowed", checked)} />
          <DateTimeField
            label="Refund cutoff"
            value={values.refund_cutoff_at}
            onChange={(value) => update("refund_cutoff_at", value)}
            disabled={!values.refund_allowed}
          />
          <TextField
            label="Time zone (IANA)"
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
