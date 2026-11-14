import { useState } from "react";
import { View } from "react-native";

import type { TicketType } from "@/api/types";
import type { CheckInFilters } from "@/api/types/admission";
import { PrimaryButton, SelectField, SubtleButton, TextButton, TextField } from "@/components/ui";

import { DateTimeField } from "../../components/DateTimeField";
import { FormMessage } from "@/components/ui/FormMessage";
import { formStyles } from "../../components/formStyles";
import { readLocalInput } from "../../utils/dateInput";
import { t, useLocale } from "@/i18n";

interface CheckInFilterFormProps {
  types: TicketType[];
  onApply: (filters: CheckInFilters) => void;
}

const SOURCES = [
  { value: "", get label() { return t("org.any_source"); } },
  { value: "online", get label() { return t("org.online_scan"); } },
  { value: "offline_sync", get label() { return t("org.offline_sync"); } },
];
const STATES = [
  { value: "", get label() { return t("org.any_state"); } },
  { value: "current", get label() { return t("org.admitted"); } },
  { value: "reversed", get label() { return t("tickets.reversed"); } },
];

// Draft filters are applied together, so the log reloads once per change.
// Typed dates are sent as ISO times.
export function CheckInFilterForm({ types, onApply }: CheckInFilterFormProps) {
  useLocale();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CheckInFilters>({});
  const [message, setMessage] = useState("");
  const set = <K extends keyof CheckInFilters>(key: K, value: CheckInFilters[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const submit = () => {
    const q = draft.q?.trim() ?? "";
    if (q.length === 1) {
      setMessage(t("org.name_search_hint"));
      return;
    }
    const from = draft.from ? readLocalInput(draft.from) : null;
    const to = draft.to ? readLocalInput(draft.to) : null;
    if ((draft.from && !from) || (draft.to && !to)) {
      setMessage(t("mobile.ui.write_dates"));
      return;
    }
    if (from && to && to < from) {
      setMessage(t("org.invalid_range"));
      return;
    }
    setMessage("");
    onApply({ ...draft, q, from: from ?? undefined, to: to ?? undefined });
  };

  const reset = () => {
    setDraft({});
    setMessage("");
    onApply({});
  };

  if (!open) return <TextButton label={t("mobile.org.filters_closed")} onPress={() => setOpen(true)} style={{ marginBottom: 8 }} />;

  return (
    <View style={[formStyles.inline, { marginBottom: 12 }]} accessibilityLabel={t("org.checkin_filters")}>
      <TextButton label={t("mobile.org.filters_open")} onPress={() => setOpen(false)} />
      <TextField label={t("tickets.attendee")} hint={t("org.name_minimum")} value={draft.q ?? ""} onChangeText={(text) => set("q", text)} maxLength={100} />
      <DateTimeField label={t("org.from")} value={draft.from ?? ""} onChange={(value) => set("from", value)} />
      <DateTimeField label={t("org.to")} value={draft.to ?? ""} onChange={(value) => set("to", value)} />
      <SelectField label={t("org.source")} value={draft.source ?? ""} options={SOURCES} onChange={(value) => set("source", value as CheckInFilters["source"])} />
      <SelectField label={t("org.state")} value={draft.state ?? ""} options={STATES} onChange={(value) => set("state", value as CheckInFilters["state"])} />
      <SelectField
        label={t("org.ticket_type")}
        value={draft.ticket_type_id ?? ""}
        options={[{ value: "", label: t("organizer.all_types") }, ...types.map((type) => ({ value: type.id, label: type.name }))]}
        onChange={(value) => set("ticket_type_id", value)}
      />
      <FormMessage message={message} />
      <View style={formStyles.actions}>
        <PrimaryButton label={t("common.apply")} onPress={submit} />
        <SubtleButton label={t("common.reset")} onPress={reset} />
      </View>
    </View>
  );
}
