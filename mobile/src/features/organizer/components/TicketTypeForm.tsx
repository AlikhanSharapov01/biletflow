import { useState } from "react";
import { View } from "react-native";

import type { EventView, TicketType, TicketTypeInput } from "@/api/types";
import { PrimaryButton, SelectField, SubtleButton, TextField } from "@/components/ui";

import { ticketTypeFormValues, toTicketTypeInput, type TicketTypeFormValues } from "../utils/eventForm";
import { CheckboxField } from "./CheckboxField";
import { DateTimeField } from "./DateTimeField";
import { FormMessage } from "@/components/ui/FormMessage";
import { formStyles } from "./formStyles";
import { Intro } from "./Intro";
import { t, useLocale } from "@/i18n";

interface TicketTypeFormProps {
  event: EventView;
  initial?: TicketType;
  submitLabel: string;
  busy: boolean;
  message: string;
  onSubmit: (input: TicketTypeInput) => Promise<void>;
  onInvalid: (error: string) => void;
  onCancel?: () => void;
}

const KINDS = [
  { value: "free", get label() { return t("common.free"); } },
  { value: "paid", get label() { return t("common.paid"); } },
];

export function TicketTypeForm({ event, initial, submitLabel, busy, message, onSubmit, onInvalid, onCancel }: TicketTypeFormProps) {
  useLocale();
  const [values, setValues] = useState<TicketTypeFormValues>(() => ticketTypeFormValues(initial));
  const update = <K extends keyof TicketTypeFormValues>(key: K, value: TicketTypeFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    const result = toTicketTypeInput(values, event);
    if (!result.ok) {
      onInvalid(result.error);
      return;
    }
    await onSubmit(result.input);
    if (!initial) setValues(ticketTypeFormValues());
  };

  return (
    <View style={formStyles.stack}>
      <TextField label={t("common.name")} value={values.name} onChangeText={(text) => update("name", text)} maxLength={200} placeholder={t("org.ticket_example")} />
      <SelectField label={t("org.kind")} value={values.kind} options={KINDS} onChange={(value) => update("kind", value as TicketTypeFormValues["kind"])} />
      <TextField label={t("common.description")} value={values.description} onChangeText={(text) => update("description", text)} maxLength={5000} placeholder={t("common.optional")} />
      <TextField
        label={t("org.price_kzt")}
        value={values.kind === "paid" ? values.price : "0"}
        onChangeText={(text) => update("price", text)}
        editable={values.kind === "paid"}
        keyboardType="decimal-pad"
      />
      <TextField
        label={t("common.quantity")}
        value={values.quantity_limit}
        onChangeText={(text) => update("quantity_limit", text)}
        keyboardType="number-pad"
        placeholder={t("org.up_to", { p0: event.capacity })}
      />
      <TextField label={t("org.per_order_limit")} value={values.per_order_limit} onChangeText={(text) => update("per_order_limit", text)} keyboardType="number-pad" />
      <CheckboxField label={t("org.hidden_attendees")} checked={values.is_hidden} onChange={(checked) => update("is_hidden", checked)} />
      <DateTimeField label={t("org.sales_open")} value={values.sales_open_at} onChange={(value) => update("sales_open_at", value)} />
      <DateTimeField label={t("org.sales_close")} value={values.sales_close_at} onChange={(value) => update("sales_close_at", value)} />
      <Intro>{t("org.sales_window_hint")}</Intro>
      <FormMessage message={message} />
      <View style={formStyles.actions}>
        <PrimaryButton label={submitLabel} onPress={() => void submit()} loading={busy} />
        {onCancel ? <SubtleButton label={t("common.cancel")} onPress={onCancel} /> : null}
      </View>
    </View>
  );
}
