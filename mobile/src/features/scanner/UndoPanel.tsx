import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { panelStyles } from "@/features/scanner/panelStyles";
import { colors } from "@/theme";

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
  return (
    <View style={[panelStyles.panel, styles.panelUndo]}>
      <Text style={panelStyles.panelTitle}>Undo admission?</Text>
      <Text style={panelStyles.panelLine}>
        {attendeeName} will be able to enter again with this ticket.
      </Text>
      <TextInput
        style={styles.reasonInput}
        placeholder="Reason, e.g. scanned by mistake"
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
          <Text style={panelStyles.panelButtonText}>Cancel</Text>
        </Pressable>
        <Pressable
          style={[panelStyles.panelButton, !canUndo && panelStyles.panelButtonDisabled]}
          onPress={onConfirm}
          disabled={!canUndo}
        >
          {undoing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={panelStyles.panelButtonText}>Undo admission</Text>
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
