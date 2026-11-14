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
import { t, useLocale } from "@/i18n";

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
  { value: "percent", get label() { return t("org.percent_off"); } },
  { value: "fixed", get label() { return t("org.fixed_off"); } },
];

export function CampaignForm({ types, initial, submitLabel, disabled = false, busy, message, onSubmit, onInvalid, onCancel }: CampaignFormProps) {
  useLocale();
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
      <TextField label={t("org.campaign_name")} value={values.name} onChangeText={(text) => update("name", text)} maxLength={200} placeholder={t("org.campaign_example")} editable={!disabled} />
      <SelectField
        label={t("common.discount")}
        value={values.discount_kind}
        options={KINDS}
        onChange={(value) => update("discount_kind", value as CampaignFormValues["discount_kind"])}
        disabled={disabled}
      />
      <TextField
        label={percent ? t("org.percent") : t("org.amount_kzt")}
        value={values.value}
        onChangeText={(text) => update("value", text)}
        keyboardType={percent ? "number-pad" : "decimal-pad"}
        editable={!disabled}
      />
      <DateTimeField label={t("org.starts")} value={values.starts_at} onChange={(value) => update("starts_at", value)} disabled={disabled} />
      <DateTimeField label={t("org.ends")} value={values.ends_at} onChange={(value) => update("ends_at", value)} disabled={disabled} />
      <TextField
        label={t("org.redemption_limit")}
        hint={t("org.blank_no_limit")}
        value={values.max_redemptions}
        onChangeText={(text) => update("max_redemptions", text)}
        keyboardType="number-pad"
        editable={!disabled}
      />
      <TextField
        label={t("checkout.promo_code")}
        hint={t("common.optional")}
        value={values.code}
        onChangeText={(text) => update("code", text.toUpperCase())}
        maxLength={32}
        placeholder="EARLYBIRD"
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!disabled}
      />
      <View style={formStyles.group}>
        <Text style={styles.legend}>{t("org.eligible_types")}</Text>
        {types.length === 0 ? <Intro>{t("org.no_ticket_types")}</Intro> : null}
        {types.map((type) => (
          <CheckboxField
            key={type.id}
            label={type.name}
            hint={type.kind === "paid" ? t("common.paid") : t("common.free")}
            checked={values.eligible_ticket_type_ids.includes(type.id)}
            onChange={() => toggleType(type.id)}
            disabled={disabled}
          />
        ))}
      </View>
      <FormMessage message={message} />
      <View style={formStyles.actions}>
        <PrimaryButton label={submitLabel} onPress={() => void submit()} disabled={disabled} loading={busy} />
        {onCancel ? <SubtleButton label={t("common.cancel")} onPress={onCancel} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.6 },
  legend: { color: colors.ink, fontFamily: fonts.sans, fontSize: 13, fontWeight: "700" },
});
