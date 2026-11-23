import { useState } from "react";
import { InputAccessoryView, Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { panelStyles } from "@/features/scanner/panelStyles";
import { colors, overlays, scanner } from "@/theme";
import { t, useLocale } from "@/i18n";

// The ticket is valid but the event requires the guest's entry confirmation
// (backend ADMISSION_REQUIRE_ENTRY_CONFIRMATION). The camera stays live to read
// the confirmation QR; the 8-digit code can be typed instead.
//
// The iPhone number pad has no Return key, so the keyboard closes by itself
// once all 8 digits are in, and a Done bar above it closes it any time.
const DONE_BAR = "entry-code-done";

export function ConfirmationPanel({
  error,
  onSubmitCode,
  onCancel,
}: {
  error: string | null;
  onSubmitCode: (code: string) => void;
  onCancel: () => void;
}) {
  useLocale();
  const [code, setCode] = useState("");
  return (
    <View style={[panelStyles.panel, styles.panel]}>
      <Text style={panelStyles.panelTitle}>{t("tickets.entry_confirmation")}</Text>
      <Text style={panelStyles.panelLine}>
        {t("mobile.scan.confirmation_intro")}
      </Text>
      <TextInput
        style={styles.input}
        value={code}
        onChangeText={(value) => {
          const digits = value.replace(/[^\d]/g, "").slice(0, 8);
          setCode(digits);
          if (digits.length === 8) Keyboard.dismiss();
        }}
        placeholder={t("mobile.scan.eight_digit_code")}
        placeholderTextColor={overlays.onDark6}
        keyboardType="number-pad"
        maxLength={8}
        accessibilityLabel={t("tickets.entry_code")}
        onSubmitEditing={() => onSubmitCode(code)}
        inputAccessoryViewID={Platform.OS === "ios" ? DONE_BAR : undefined}
      />
      {Platform.OS === "ios" ? (
        <InputAccessoryView nativeID={DONE_BAR}>
          <View style={styles.doneBar}>
            <Pressable accessibilityRole="button" onPress={() => Keyboard.dismiss()} hitSlop={8}>
              <Text style={styles.doneText}>{t("org.done")}</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <View style={panelStyles.panelActions}>
        <Pressable
          accessibilityRole="button"
          style={[panelStyles.panelButton, panelStyles.panelButtonSecondary]}
          onPress={onCancel}
        >
          <Text style={panelStyles.panelButtonText}>{t("common.cancel")}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={[panelStyles.panelButton, code.length !== 8 && panelStyles.panelButtonDisabled]}
          disabled={code.length !== 8}
          onPress={() => onSubmitCode(code)}
        >
          <Text style={panelStyles.panelButtonText}>{t("mobile.scan.check_in")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: scanner.warning },
  input: {
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: overlays.onDark5,
    borderRadius: 8,
    color: colors.onGreen,
    fontSize: 22,
    letterSpacing: 4,
  },
  error: { color: colors.paper, fontSize: 14, fontWeight: "600" },
  doneBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.paper,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  doneText: { color: colors.green, fontSize: 17, fontWeight: "700" },
});
