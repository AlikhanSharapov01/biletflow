import { Pressable, StyleSheet, Text, View } from "react-native";

import { panelStyles } from "@/features/scanner/panelStyles";
import type { ResultPhase } from "@/features/scanner/scanTypes";
import { colors } from "@/theme";
import { useLocale } from "@/i18n";
import { t } from "@/i18n";

// The outcome of a scan (or of an undo), coloured by tone, with Retry /
// Undo when they apply and always "Scan next".
export function ResultPanel({
  result,
  onRetry,
  onUndo,
  onScanNext,
}: {
  result: ResultPhase;
  onRetry: () => void;
  onUndo: () => void;
  onScanNext: () => void;
}) {
  useLocale();
  const { view } = result;
  return (
    <View style={[panelStyles.panel, toneStyles[view.tone]]}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelIcon}>{view.icon}</Text>
        <Text style={panelStyles.panelTitle}>{view.title}</Text>
      </View>
      {view.lines.map((line, index) => (
        <Text key={index} style={panelStyles.panelLine}>
          {line}
        </Text>
      ))}
      <View style={panelStyles.panelActions}>
        {result.retryable ? (
          <Pressable
            style={[panelStyles.panelButton, panelStyles.panelButtonSecondary]}
            onPress={onRetry}
          >
            <Text style={panelStyles.panelButtonText}>{t("mobile.ui.retry")}</Text>
          </Pressable>
        ) : null}
        {result.admission ? (
          <Pressable
            style={[panelStyles.panelButton, panelStyles.panelButtonSecondary]}
            onPress={onUndo}
          >
            <Text style={panelStyles.panelButtonText}>{t("mobile.ui.undo")}</Text>
          </Pressable>
        ) : null}
        <Pressable style={panelStyles.panelButton} onPress={onScanNext}>
          <Text style={panelStyles.panelButtonText}>{t("mobile.scan.scan_next")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Web palette, darkened where needed to keep white text readable at a
// distance in a dim entrance.
const toneStyles = StyleSheet.create({
  admitted: {
    backgroundColor: colors.green,
  },
  warning: {
    backgroundColor: "#a57324",
  },
  rejected: {
    backgroundColor: "#a44735",
  },
  offline: {
    backgroundColor: "#4f5c55",
  },
});

const styles = StyleSheet.create({
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  panelIcon: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "700",
    width: 32,
    textAlign: "center",
  },
});
