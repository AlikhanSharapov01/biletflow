import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { panelStyles } from "@/features/scanner/panelStyles";
import { colors } from "@/theme";
import { t, useLocale } from "@/i18n";

// Asks for a reason before reversing the admission just made.
export function UndoPanel({
  attendeeName,
  reason,
  onReasonChange,
  undoing,
  error,
  canUndo,
  onCancel,
  onConfirm,
}: {
  attendeeName: string;
  reason: string;
  onReasonChange: (reason: string) => void;
  undoing: boolean;
  error: string | null;
  canUndo: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useLocale();
  return (
    <View style={[panelStyles.panel, styles.panelUndo]}>
      <Text style={panelStyles.panelTitle}>{t("mobile.scan.undo_title")}</Text>
      <Text style={panelStyles.panelLine}>
        {t("mobile.scan.undo_line", { name: attendeeName })}
      </Text>
      <TextInput
        style={styles.reasonInput}
        placeholder={t("mobile.scan.undo_reason_placeholder")}
        placeholderTextColor="rgba(255,255,255,0.6)"
        value={reason}
        onChangeText={onReasonChange}
        editable={!undoing}
        maxLength={500}
        autoFocus
      />
      {error ? <Text style={styles.panelError}>{error}</Text> : null}
      <View style={panelStyles.panelActions}>
        <Pressable
          style={[panelStyles.panelButton, panelStyles.panelButtonSecondary]}
          onPress={onCancel}
          disabled={undoing}
        >
          <Text style={panelStyles.panelButtonText}>{t("common.cancel")}</Text>
        </Pressable>
        <Pressable
          style={[panelStyles.panelButton, !canUndo && panelStyles.panelButtonDisabled]}
          onPress={onConfirm}
          disabled={!canUndo}
        >
          {undoing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={panelStyles.panelButtonText}>{t("mobile.scan.undo_admission")}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panelUndo: {
    backgroundColor: colors.greenStory,
  },
  reasonInput: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#fff",
    marginTop: 6,
  },
  panelError: {
    color: "#FCA5A5",
    fontSize: 14,
  },
});
