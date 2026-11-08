import { useState } from "react";
import { View } from "react-native";

import type { TicketType } from "@/api/types";
import type { AnalyticsFilters, SeriesBucket } from "@/api/types/analytics";
import { PrimaryButton, SelectField, TextButton } from "@/components/ui";

import { DateTimeField } from "../../components/DateTimeField";
import { FormMessage } from "@/components/ui/FormMessage";
import { formStyles } from "../../components/formStyles";
import { readLocalInput } from "../../utils/dateInput";

interface AnalyticsFilterBarProps {
  types: TicketType[];
  campaigns: Array<{ id: string; name: string }>;
  bucket: SeriesBucket;
  disabled?: boolean;
  onApply: (filters: AnalyticsFilters, bucket: SeriesBucket) => void;
}

const BUCKETS = [
  { value: "day", label: "Day" },
  { value: "hour", label: "Hour" },
];

// Filters above the charts, applied together. Typed dates go out as ISO times.
export function AnalyticsFilterBar({ types, campaigns, bucket, disabled = false, onApply }: AnalyticsFilterBarProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AnalyticsFilters>({});
  const [draftBucket, setDraftBucket] = useState<SeriesBucket>(bucket);
  const [message, setMessage] = useState("");
  const set = <K extends keyof AnalyticsFilters>(key: K, value: AnalyticsFilters[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const submit = () => {
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
    onApply({ ...draft, from: from ?? undefined, to: to ?? undefined }, draftBucket);
  };

  if (!open) return <TextButton label="▸ Filters" onPress={() => setOpen(true)} disabled={disabled} />;

  return (
    <View style={formStyles.inline} accessibilityLabel="Analytics filters">
      <TextButton label="▾ Filters" onPress={() => setOpen(false)} />
      <DateTimeField label="From" value={draft.from ?? ""} onChange={(value) => set("from", value)} disabled={disabled} />
      <DateTimeField label="To" value={draft.to ?? ""} onChange={(value) => set("to", value)} disabled={disabled} />
      <SelectField
        label="Ticket type"
        value={draft.ticket_type_id ?? ""}
        options={[{ value: "", label: "All ticket types" }, ...types.map((type) => ({ value: type.id, label: type.name }))]}
        onChange={(value) => set("ticket_type_id", value)}
        disabled={disabled}
      />
      <SelectField
        label="Campaign"
        value={draft.campaign_id ?? ""}
        options={[{ value: "", label: "All sales" }, ...campaigns.map((campaign) => ({ value: campaign.id, label: campaign.name }))]}
        onChange={(value) => set("campaign_id", value)}
        disabled={disabled}
      />
      <SelectField label="Group by" value={draftBucket} options={BUCKETS} onChange={(value) => setDraftBucket(value as SeriesBucket)} disabled={disabled} />
      <FormMessage message={message} />
      <PrimaryButton label="Apply" onPress={submit} disabled={disabled} />
    </View>
  );
}
