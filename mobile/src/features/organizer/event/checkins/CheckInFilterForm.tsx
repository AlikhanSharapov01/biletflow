import { useState } from "react";
import { View } from "react-native";

import type { TicketType } from "@/api/types";
import type { CheckInFilters } from "@/api/types/admission";
import { PrimaryButton, SelectField, SubtleButton, TextButton, TextField } from "@/components/ui";

import { DateTimeField } from "../../components/DateTimeField";
import { FormMessage } from "@/components/ui/FormMessage";
import { formStyles } from "../../components/formStyles";
import { readLocalInput } from "../../utils/dateInput";

interface CheckInFilterFormProps {
  types: TicketType[];
  onApply: (filters: CheckInFilters) => void;
}

const SOURCES = [
  { value: "", label: "Any source" },
  { value: "online", label: "Online scan" },
  { value: "offline_sync", label: "Offline sync" },
];
const STATES = [
  { value: "", label: "Any state" },
  { value: "current", label: "Admitted" },
  { value: "reversed", label: "Reversed" },
];

// Draft filters are applied together, so the log reloads once per change.
// Typed dates are sent as ISO times.
export function CheckInFilterForm({ types, onApply }: CheckInFilterFormProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CheckInFilters>({});
  const [message, setMessage] = useState("");
  const set = <K extends keyof CheckInFilters>(key: K, value: CheckInFilters[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const submit = () => {
    const q = draft.q?.trim() ?? "";
    if (q.length === 1) {
      setMessage("Type at least two letters of the attendee’s name.");
      return;
    }
    const from = draft.from ? readLocalInput(draft.from) : null;
    const to = draft.to ? readLocalInput(draft.to) : null;
    if ((draft.from && !from) || (draft.to && !to)) {
      setMessage("Write dates as YYYY-MM-DD HH:mm.");
      return;
    }
    if (from && to && to < from) {
      setMessage("“To” must be after “From”.");
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

  if (!open) return <TextButton label="▸ Filters" onPress={() => setOpen(true)} style={{ marginBottom: 8 }} />;

  return (
    <View style={[formStyles.inline, { marginBottom: 12 }]} accessibilityLabel="Check-in filters">
      <TextButton label="▾ Filters" onPress={() => setOpen(false)} />
      <TextField label="Attendee" hint="Name, 2+ letters" value={draft.q ?? ""} onChangeText={(text) => set("q", text)} maxLength={100} />
      <DateTimeField label="From" value={draft.from ?? ""} onChange={(value) => set("from", value)} />
      <DateTimeField label="To" value={draft.to ?? ""} onChange={(value) => set("to", value)} />
      <SelectField label="Source" value={draft.source ?? ""} options={SOURCES} onChange={(value) => set("source", value as CheckInFilters["source"])} />
      <SelectField label="State" value={draft.state ?? ""} options={STATES} onChange={(value) => set("state", value as CheckInFilters["state"])} />
      <SelectField
        label="Ticket type"
        value={draft.ticket_type_id ?? ""}
        options={[{ value: "", label: "All ticket types" }, ...types.map((type) => ({ value: type.id, label: type.name }))]}
        onChange={(value) => set("ticket_type_id", value)}
      />
      <FormMessage message={message} />
      <View style={formStyles.actions}>
        <PrimaryButton label="Apply" onPress={submit} />
        <SubtleButton label="Reset" onPress={reset} />
      </View>
    </View>
  );
}
