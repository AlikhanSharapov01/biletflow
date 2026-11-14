import type { Dispatch, SetStateAction } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { Hold } from "@/api/types";
import { PrimaryButton, SubtleButton, TextField } from "@/components/ui";
import { colors, fonts, radii } from "@/theme";
import { priceLabel } from "@/utils/format";
import type { RecipientValues } from "../utils/checkout";
import { checkoutStyles } from "./checkoutStyles";
import { FormMessage } from "@/components/ui/FormMessage";
import { HoldCountdown } from "./HoldCountdown";
import { PriceSummary } from "./PriceSummary";
import { t, useLocale } from "@/i18n";

interface RecipientFormProps {
  hold: Hold;
  typeName: (typeId: string) => string;
  recipients: RecipientValues;
  setRecipients: Dispatch<SetStateAction<RecipientValues>>;
  secondsLeft: number;
  busy: boolean;
  message: string;
  // Paid baskets continue to the simulated payment instead of confirming.
  paid: boolean;
  subtotalMinor: number;
  onConfirm: () => void;
  onRelease: () => void;
}

// Step two: one name and email per held place, then confirm.
export function RecipientForm({ hold, typeName, recipients, setRecipients, secondsLeft, busy, message, paid, subtotalMinor, onConfirm, onRelease }: RecipientFormProps) {
  useLocale();
  const confirmLabel = busy ? (paid ? t("checkout.preparing_payment") : t("checkout.confirming")) : paid ? t("checkout.continue_payment") : t("checkout.confirm_registration");
  return (
    <View style={checkoutStyles.stack}>
      <View style={checkoutStyles.head}>
        <Text style={checkoutStyles.heading} accessibilityRole="header">
          {t("checkout.who_coming")}
        </Text>
        <HoldCountdown secondsLeft={secondsLeft} />
      </View>
      <Text style={checkoutStyles.intro}>{t("checkout.recipient_hint")}</Text>
      {hold.allocations.map((allocation, index) => {
        const value = recipients[allocation.id] ?? { name: "", email: "" };
        const change = (key: "name" | "email", next: string) =>
          setRecipients((current) => ({ ...current, [allocation.id]: { ...(current[allocation.id] ?? value), [key]: next } }));
        const legend = t("mobile.checkout.ticket_legend", { p0: index + 1, p1: typeName(allocation.ticket_type_id) });
        return (
          <View style={styles.recipient} key={allocation.id}>
            <Text style={styles.legend}>{legend}</Text>
            <TextField
              label={t("common.name")}
              value={value.name}
              maxLength={200}
              autoComplete="name"
              accessibilityLabel={t("mobile.checkout.recipient_name", { p0: legend })}
              onChangeText={(next) => change("name", next)}
            />
            <TextField
              label={t("common.email")}
              value={value.email}
              maxLength={254}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel={t("mobile.checkout.recipient_email", { p0: legend })}
              onChangeText={(next) => change("email", next)}
            />
          </View>
        );
      })}
      {hold.pricing ? (
        <PriceSummary pricing={hold.pricing} />
      ) : paid ? (
        <Text style={checkoutStyles.intro}>
          {t("checkout.ticket_subtotal")} <Text style={checkoutStyles.strong}>{priceLabel(subtotalMinor)}</Text>{t("checkout.final_quote_hint")}
        </Text>
      ) : null}
      <FormMessage message={message} />
      <View style={checkoutStyles.actions}>
        <PrimaryButton label={confirmLabel} disabled={busy} onPress={onConfirm} />
        <SubtleButton label={t("checkout.choose_again")} disabled={busy} onPress={onRelease} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  recipient: { gap: 10, padding: 12, borderWidth: 1, borderColor: colors.line, borderRadius: radii.panel },
  legend: { color: colors.ink, fontFamily: fonts.sans, fontSize: 13, fontWeight: "700" },
});
