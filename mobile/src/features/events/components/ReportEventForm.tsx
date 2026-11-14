import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { describeError } from "@/api/errors";
import { reportEvent, type ReportCategory } from "@/api/reports";
import { SelectField, SubtleButton, TextField } from "@/components/ui";
import { FormMessage } from "@/components/ui/FormMessage";
import { colors, fonts } from "@/theme";
import { t, useLocale } from "@/i18n";

const CATEGORIES: Array<{ value: ReportCategory; label: string }> = [
  { value: "misleading", get label() { return t("event.report_misleading"); } },
  { value: "fraud", get label() { return t("event.report_fraud"); } },
  { value: "spam", get label() { return t("event.report_spam"); } },
  { value: "inappropriate", get label() { return t("event.report_content"); } },
  { value: "safety", get label() { return t("event.report_safety"); } },
  { value: "other", get label() { return t("event.report_other"); } },
];

// A small disclosure; platform admins review reports.
export function ReportEventForm({ eventId }: { eventId: string }) {
  useLocale();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ReportCategory>("misleading");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ text: "", success: false });

  const submit = async () => {
    if (!description.trim()) {
      setMessage({ text: t("event.report_details"), success: false });
      return;
    }
    setBusy(true);
    setMessage({ text: "", success: false });
    try {
      const receipt = await reportEvent(eventId, { category, description: description.trim() });
      setMessage({
        text: receipt.duplicate
          ? t("event.already_reported")
          : t("event.report_sent"),
        success: true,
      });
      setDescription("");
    } catch (failure) {
      setMessage({ text: describeError(failure), success: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.block}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((value) => !value)} hitSlop={6}>
        <Text style={styles.summary}>
          {open ? "▾" : "▸"} {t("event.report")}
        </Text>
      </Pressable>
      {open ? (
        <View style={styles.form}>
          <SelectField label={t("common.reason")} value={category} options={CATEGORIES} onChange={(value) => setCategory(value as ReportCategory)} />
          <TextField label={t("event.report_question")} value={description} maxLength={2000} multiline numberOfLines={4} onChangeText={setDescription} />
          <FormMessage message={message.text} success={message.success} />
          <SubtleButton danger label={busy ? t("common.sending") : t("event.send_report")} disabled={busy} onPress={() => void submit()} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 10, marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.lineSoft },
  summary: { color: colors.muted, fontFamily: fonts.sans, fontSize: 14, fontWeight: "700" },
  form: { gap: 12 },
});
