import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { TicketType } from "@/api/types";
import type { Campaign, CampaignInput } from "@/api/types/campaigns";
import { PrimaryButton, SelectField, SubtleButton, TextField } from "@/components/ui";
import { colors, fonts } from "@/theme";

import { CheckboxField } from "../../components/CheckboxField";
import { DateTimeField } from "../../components/DateTimeField";
import { FormMessage } from "@/components/ui/FormMessage";
import { formStyles } from "../../components/formStyles";
import { Intro } from "../../components/Intro";
import { campaignFormValues, toCampaignInput, type CampaignFormValues } from "../../utils/campaignForm";

interface CampaignFormProps {
  types: TicketType[];
  initial?: Campaign;
  submitLabel: string;
  disabled?: boolean;
  busy: boolean;
  message: string;
  onSubmit: (input: CampaignInput) => Promise<boolean | void>;
  onInvalid: (error: string) => void;
  onCancel?: () => void;
}

const KINDS = [
  { value: "percent", label: "Percent off" },
  { value: "fixed", label: "Fixed amount off (KZT)" },
];

export function CampaignForm({ types, initial, submitLabel, disabled = false, busy, message, onSubmit, onInvalid, onCancel }: CampaignFormProps) {
  const [values, setValues] = useState<CampaignFormValues>(() => campaignFormValues(initial));
  const update = <K extends keyof CampaignFormValues>(key: K, value: CampaignFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  const toggleType = (id: string) =>
    update(
      "eligible_ticket_type_ids",
      values.eligible_ticket_type_ids.includes(id) ? values.eligible_ticket_type_ids.filter((item) => item !== id) : [...values.eligible_ticket_type_ids, id],
    );
  const percent = values.discount_kind === "percent";

  const submit = async () => {
    const result = toCampaignInput(values);
    if (!result.ok) {
      onInvalid(result.error);
      return;
    }
    const saved = await onSubmit(result.input);
    if (!initial && saved !== false) setValues(campaignFormValues());
  };

  return (
    <View style={[formStyles.stack, disabled && styles.disabled]} pointerEvents={disabled ? "none" : "auto"} accessibilityState={{ disabled }}>
      <TextField label="Campaign name" value={values.name} onChangeText={(text) => update("name", text)} maxLength={200} placeholder="e.g. Early bird" editable={!disabled} />
      <SelectField
        label="Discount"
        value={values.discount_kind}
        options={KINDS}
        onChange={(value) => update("discount_kind", value as CampaignFormValues["discount_kind"])}
        disabled={disabled}
      />
      <TextField
        label={percent ? "Percent" : "Amount (KZT)"}
        value={values.value}
        onChangeText={(text) => update("value", text)}
        keyboardType={percent ? "number-pad" : "decimal-pad"}
        editable={!disabled}
      />
      <DateTimeField label="Starts" value={values.starts_at} onChange={(value) => update("starts_at", value)} disabled={disabled} />
      <DateTimeField label="Ends" value={values.ends_at} onChange={(value) => update("ends_at", value)} disabled={disabled} />
      <TextField
        label="Redemption limit"
        hint="Blank = no limit"
        value={values.max_redemptions}
        onChangeText={(text) => update("max_redemptions", text)}
        keyboardType="number-pad"
        editable={!disabled}
      />
      <TextField
        label="Promo code"
        hint="Optional"
        value={values.code}
        onChangeText={(text) => update("code", text.toUpperCase())}
        maxLength={32}
        placeholder="EARLYBIRD"
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!disabled}
      />
      <View style={formStyles.group}>
        <Text style={styles.legend}>Eligible ticket types (none selected = all)</Text>
        {types.length === 0 ? <Intro>No ticket types yet.</Intro> : null}
        {types.map((type) => (
          <CheckboxField
            key={type.id}
            label={type.name}
            hint={type.kind === "paid" ? "Paid" : "Free"}
            checked={values.eligible_ticket_type_ids.includes(type.id)}
            onChange={() => toggleType(type.id)}
            disabled={disabled}
          />
        ))}
      </View>
      <FormMessage message={message} />
      <View style={formStyles.actions}>
        <PrimaryButton label={submitLabel} onPress={() => void submit()} disabled={disabled} loading={busy} />
        {onCancel ? <SubtleButton label="Cancel" onPress={onCancel} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.6 },
  legend: { color: colors.ink, fontFamily: fonts.sans, fontSize: 13, fontWeight: "700" },
});
