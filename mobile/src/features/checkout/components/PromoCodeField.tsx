import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { describeError, isNotImplemented } from "@/api/errors";
import { previewPromo } from "@/api/promo";
import type { PromoPreview } from "@/api/types/promo";
import { StatusPill, SubtleButton, fieldStyles } from "@/components/ui";
import { colors, fonts, statusTones } from "@/theme";
import { normalizePromoCode, promoSummary, stashPromo } from "../utils/promo";

interface PromoCodeFieldProps {
  eventId: string;
  initialCode: string;
  applied: PromoPreview | null;
  onApplied: (preview: PromoPreview | null) => void;
}

type Note = { kind: "error" | "info" | "success"; text: string } | null;

// Checks a code with the (planned) preview endpoint. Only an accepted code is
// sent with the hold; while the endpoint is missing nothing is sent.
export function PromoCodeField({ eventId, initialCode, applied, onApplied }: PromoCodeFieldProps) {
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const tried = useRef(false);

  const check = async (value: string) => {
    const normalized = normalizePromoCode(value);
    if (!normalized) return;
    setBusy(true);
    setNote(null);
    try {
      const preview = await previewPromo(eventId, normalized);
      onApplied(preview);
      stashPromo(eventId, preview.code);
      setNote({ kind: "success", text: promoSummary(preview) });
    } catch (failure) {
      onApplied(null);
      setNote(
        isNotImplemented(failure)
          ? { kind: "info", text: "Promo codes are coming soon. Your code was not applied." }
          : { kind: "error", text: describeError(failure) },
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (initialCode && !tried.current) {
      tried.current = true;
      void check(initialCode);
    }
    // Runs once for a code from a campaign link or the stash.
  }, [initialCode]);

  const remove = () => {
    onApplied(null);
    stashPromo(eventId, "");
    setCode("");
    setNote(null);
  };

  return (
    <View style={styles.field}>
      <Text style={fieldStyles.label}>
        Promo code <Text style={styles.optional}>Optional</Text>
      </Text>
      <View style={styles.row}>
        <TextInput
          style={[fieldStyles.box, styles.input, Boolean(applied) && styles.locked]}
          value={code}
          maxLength={64}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!applied}
          accessibilityLabel="Promo code"
          returnKeyType="done"
          onChangeText={setCode}
          onSubmitEditing={() => void check(code)}
        />
        {applied ? (
          <SubtleButton label="Remove" onPress={remove} />
        ) : (
          <SubtleButton label={busy ? "Checking…" : "Apply"} disabled={busy || !code.trim()} onPress={() => void check(code)} />
        )}
      </View>
      {note?.kind === "info" ? <StatusPill tone="neutral" label="Not available yet" /> : null}
      {note ? (
        <Text style={[styles.note, styles[note.kind]]} accessibilityLiveRegion="polite">
          {note.text}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 7 },
  optional: { color: colors.faint, fontSize: 12, fontWeight: "400" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: { flex: 1, color: colors.ink, fontFamily: fonts.sans, fontSize: 15 },
  locked: { opacity: 0.6 },
  note: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
  success: { color: statusTones.positive.color, fontWeight: "600" },
  info: { color: statusTones.neutral.color },
  error: { color: colors.error },
});
