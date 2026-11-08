import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { PrimaryButton, SubtleButton } from "@/components/ui/Buttons";
import { TextField } from "@/components/ui/TextField";
import { colors, fonts, radii } from "@/theme";

// Asks for a short reason before an audited action (web window.prompt):
// cancelling a ticket, refunding, reversing a check-in, suspending a user.
export function ReasonDialog({
  visible,
  title,
  message,
  confirmLabel = "Confirm",
  required = true,
  busy = false,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  required?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (visible) setReason("");
  }, [visible]);
  const trimmed = reason.trim();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Close" />
        <View style={styles.sheet} accessibilityViewIsModal>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <TextField
            label="Reason"
            hint="Shown in the activity history."
            value={reason}
            onChangeText={setReason}
            multiline
            autoFocus
          />
          <View style={styles.actions}>
            <SubtleButton label="Cancel" onPress={onCancel} style={styles.action} />
            <PrimaryButton
              label={confirmLabel}
              onPress={() => onSubmit(trimmed)}
              disabled={required && !trimmed}
              loading={busy}
              style={styles.action}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: "rgba(23,39,36,0.35)" },
  sheet: { gap: 12, padding: 18, borderRadius: radii.panel, backgroundColor: colors.paper },
  title: { color: colors.ink, fontFamily: fonts.sans, fontSize: 17, fontWeight: "700" },
  message: { color: colors.muted, fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: "row", gap: 10 },
  action: { flex: 1 },
});
