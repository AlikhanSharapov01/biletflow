import { useState } from "react";
import { View } from "react-native";

import type { InspectKind, OpsFilters, WorkKind } from "@/api/types/admin";
import { PrimaryButton, SelectField, TextButton, TextField } from "@/components/ui";
import { FormMessage } from "@/components/ui/FormMessage";
import { t, useLocale } from "@/i18n";
import { statusLabel } from "@/utils/format";

import { formStyles } from "../../organizer/components/formStyles";
import { EMPTY_OPS_DRAFT, OPS_STATUSES, OPS_TEXT_SEARCH, toOpsFilters, type OpsDraft } from "../utils/ops";

interface OpsFilterFormProps {
  kind: InspectKind | WorkKind;
  onApply: (filters: OpsFilters) => void;
}

// Filters for the inspection and background-work lists: literal text where
// the view has it, a status and an exact event id.
export function OpsFilterForm({ kind, onApply }: OpsFilterFormProps) {
  useLocale();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<OpsDraft>(EMPTY_OPS_DRAFT);
  const [message, setMessage] = useState("");
  const set = (key: keyof OpsDraft, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const statuses = OPS_STATUSES[kind];

  if (!open) return <TextButton label={t("mobile.org.filters_closed")} onPress={() => setOpen(true)} />;

  const apply = () => {
    const result = toOpsFilters(draft);
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
      {OPS_TEXT_SEARCH.has(kind) ? (
        <TextField
          label={t("common.search")}
          accessibilityLabel={t("common.search")}
          placeholder={kind === "campaigns" ? t("mobile.admin.campaign_search_hint") : t("mobile.admin.case_search_hint")}
          value={draft.q}
          onChangeText={(value) => set("q", value)}
          maxLength={200}
          autoCorrect={false}
        />
      ) : null}
      {statuses.length ? (
        <SelectField
          label={t("common.status")}
          value={draft.status}
          options={[{ value: "", label: t("admin.any") }, ...statuses.map((status) => ({ value: status, label: statusLabel(status) }))]}
          onChange={(value) => set("status", value)}
        />
      ) : null}
      <TextField
        label={t("mobile.admin.event_id_filter")}
        accessibilityLabel={t("mobile.admin.event_id_filter")}
        value={draft.event_id}
        onChangeText={(value) => set("event_id", value)}
        maxLength={36}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <FormMessage message={message} />
      <PrimaryButton label={t("common.apply")} onPress={apply} />
    </View>
  );
}
