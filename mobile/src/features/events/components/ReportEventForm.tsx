import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { describeError } from "@/api/errors";
import { reportEvent, type ReportCategory } from "@/api/reports";
import { SelectField, SubtleButton, TextField } from "@/components/ui";
import { FormMessage } from "@/components/ui/FormMessage";
import { colors, fonts } from "@/theme";

const CATEGORIES: Array<{ value: ReportCategory; label: string }> = [
  { value: "misleading", label: "Misleading information" },
  { value: "fraud", label: "Fraud or scam" },
  { value: "spam", label: "Spam" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "safety", label: "Safety concern" },
  { value: "other", label: "Something else" },
];

// A small disclosure; platform admins review reports.
export function ReportEventForm({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ReportCategory>("misleading");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ text: "", success: false });

  const submit = async () => {
    if (!description.trim()) {
      setMessage({ text: "Describe what is wrong with this event.", success: false });
      return;
    }
    setBusy(true);
    setMessage({ text: "", success: false });
    try {
      const receipt = await reportEvent(eventId, { category, description: description.trim() });
      setMessage({
        text: receipt.duplicate
          ? "You already reported this event for that reason. Our team is reviewing it."
          : "Thanks. Your report was sent to the BiletFlow team.",
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
          {open ? "▾" : "▸"} Report this event
        </Text>
      </Pressable>
      {open ? (
        <View style={styles.form}>
          <SelectField label="Reason" value={category} options={CATEGORIES} onChange={(value) => setCategory(value as ReportCategory)} />
          <TextField label="What is wrong?" value={description} maxLength={2000} multiline numberOfLines={4} onChangeText={setDescription} />
          <FormMessage message={message.text} success={message.success} />
          <SubtleButton danger label={busy ? "Sending…" : "Send report"} disabled={busy} onPress={() => void submit()} />
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
