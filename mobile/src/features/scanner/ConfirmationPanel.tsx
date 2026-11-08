import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { panelStyles } from "@/features/scanner/panelStyles";
import { colors } from "@/theme";

// The ticket is valid but the event requires the guest's entry confirmation
// (backend ADMISSION_REQUIRE_ENTRY_CONFIRMATION). The camera stays live to read
// the confirmation QR; the 8-digit code can be typed instead.
export function ConfirmationPanel({
  error,
  onSubmitCode,
  onCancel,
}: {
  error: string | null;
  onSubmitCode: (code: string) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState("");
  return (
    <View style={[panelStyles.panel, styles.panel]}>
      <Text style={panelStyles.panelTitle}>Entry confirmation</Text>
      <Text style={panelStyles.panelLine}>
        Ask the guest to open their ticket and show the entry confirmation. Scan its QR code, or type
        the 8-digit code.
      </Text>
      <TextInput
        style={styles.input}
        value={code}
        onChangeText={(value) => setCode(value.replace(/[^\d]/g, "").slice(0, 8))}
        placeholder="8-digit code"
        placeholderTextColor="rgba(255,255,255,0.6)"
        keyboardType="number-pad"
        maxLength={8}
        accessibilityLabel="Entry code"
        onSubmitEditing={() => onSubmitCode(code)}
      />
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
          <Text style={panelStyles.panelButtonText}>Cancel</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={[panelStyles.panelButton, code.length !== 8 && panelStyles.panelButtonDisabled]}
          disabled={code.length !== 8}
          onPress={() => onSubmitCode(code)}
        >
          <Text style={panelStyles.panelButtonText}>Check in</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: "#a57324" },
  input: {
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
    borderRadius: 8,
    color: "#fff",
    fontSize: 22,
    letterSpacing: 4,
  },
  error: { color: colors.paper, fontSize: 14, fontWeight: "600" },
});
