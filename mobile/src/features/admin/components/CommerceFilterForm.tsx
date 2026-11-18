import { useState } from "react";
import { View } from "react-native";

import type { CommerceFilters, CommerceKind } from "@/api/types/admin";
import { PrimaryButton, SelectField, TextButton, TextField } from "@/components/ui";
import { FormMessage } from "@/components/ui/FormMessage";
import { t, useLocale } from "@/i18n";
import { statusLabel } from "@/utils/format";

import { DateTimeField } from "../../organizer/components/DateTimeField";
import { formStyles } from "../../organizer/components/formStyles";
import { COMMERCE_STATUSES, EMPTY_COMMERCE_DRAFT, toCommerceFilters, type CommerceDraft } from "../utils/commerce";

interface CommerceFilterFormProps {
  kind: CommerceKind;
  onApply: (filters: CommerceFilters) => void;
}

// Exact filters for the payment, failed-payment and refund lists (no text search).
export function CommerceFilterForm({ kind, onApply }: CommerceFilterFormProps) {
  useLocale();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CommerceDraft>(EMPTY_COMMERCE_DRAFT);
  const [message, setMessage] = useState("");
  const set = (key: keyof CommerceDraft, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const any = { value: "", label: t("admin.any") };

  if (!open) return <TextButton label={t("mobile.org.filters_closed")} onPress={() => setOpen(true)} />;

  const apply = () => {
    const result = toCommerceFilters(draft);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setMessage("");
    onApply(result.filters);
  };

  return (
    <View style={formStyles.inline} accessibilityRole="search">
      <TextButton label={t("mobile.org.filters_open")} onPress={() => setOpen(false)} />
      {COMMERCE_STATUSES[kind].length ? (
        <SelectField
          label={t("common.status")}
          value={draft.status}
          options={[any, ...COMMERCE_STATUSES[kind].map((status) => ({ value: status, label: statusLabel(status) }))]}
          onChange={(value) => set("status", value)}
        />
      ) : null}
      <SelectField
        label={t("mobile.admin.purpose")}
        value={draft.purpose}
        options={[
          any,
          { value: "ticket_order", label: t("mobile.admin.purpose_ticket_order") },
          { value: "activation", label: t("mobile.admin.purpose_activation") },
        ]}
        onChange={(value) => set("purpose", value)}
      />
      <SelectField
        label={t("mobile.admin.environment")}
        value={draft.environment}
        options={[
          any,
          { value: "simulation", label: t("mobile.admin.env_simulation") },
          { value: "sandbox", label: t("mobile.admin.env_sandbox") },
        ]}
        onChange={(value) => set("environment", value)}
      />
      <TextField
        label={t("mobile.admin.event_id_filter")}
        accessibilityLabel={t("mobile.admin.event_id_filter")}
        value={draft.event_id}
        onChangeText={(value) => set("event_id", value)}
        maxLength={36}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TextField
        label={t("mobile.admin.order_id")}
        accessibilityLabel={t("mobile.admin.order_id")}
        value={draft.order_id}
        onChangeText={(value) => set("order_id", value)}
        maxLength={36}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <DateTimeField label={t("org.from")} value={draft.from} onChange={(value) => set("from", value)} />
      <DateTimeField label={t("org.to")} value={draft.to} onChange={(value) => set("to", value)} />
      <FormMessage message={message} />
      <PrimaryButton label={t("common.apply")} onPress={apply} />
    </View>
  );
}
