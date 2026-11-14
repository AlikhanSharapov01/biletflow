import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { describeError } from "@/api/errors";
import { previewPromo } from "@/api/promo";
import type { PromoPreview } from "@/api/types/promo";
import { SubtleButton, fieldStyles } from "@/components/ui";
import { colors, fonts, statusTones } from "@/theme";
import { normalizePromoCode, promoSummary, stashPromo } from "../utils/promo";
import { t, useLocale } from "@/i18n";

interface PromoCodeFieldProps {
  eventId: string;
  initialCode: string;
  applied: PromoPreview | null;
  onApplied: (preview: PromoPreview | null) => void;
}

type Note = { kind: "error" | "success"; text: string } | null;

// Previews a code. Only an accepted code is sent with the hold, and the hold
// response is authoritative for basket pricing.
export function PromoCodeField({ eventId, initialCode, applied, onApplied }: PromoCodeFieldProps) {
  useLocale();
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
      setNote({ kind: "error", text: describeError(failure) });
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
        {t("checkout.promo_code")} <Text style={styles.optional}>{t("common.optional")}</Text>
      </Text>
      <View style={styles.row}>
        <TextInput
          style={[fieldStyles.box, styles.input, Boolean(applied) && styles.locked]}
          value={code}
          maxLength={64}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!applied}
          accessibilityLabel={t("checkout.promo_code")}
          returnKeyType="done"
          onChangeText={setCode}
          onSubmitEditing={() => void check(code)}
        />
        {applied ? (
          <SubtleButton label={t("common.remove")} onPress={remove} />
        ) : (
          <SubtleButton label={busy ? t("checkout.checking") : t("common.apply")} disabled={busy || !code.trim()} onPress={() => void check(code)} />
        )}
      </View>
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
  error: { color: colors.error },
});
