import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Screen } from "@/components/layout";
import { LoadingState, PrimaryButton } from "@/components/ui";
import { CameraPermissionGate } from "@/features/scanner/CameraPermissionGate";
import { CheckingPanel } from "@/features/scanner/CheckingPanel";
import { ResultPanel } from "@/features/scanner/ResultPanel";
import { ScanHeader } from "@/features/scanner/ScanHeader";
import { ScannerCamera } from "@/features/scanner/ScannerCamera";
import { UndoPanel } from "@/features/scanner/UndoPanel";
import { useScannerEvent } from "@/features/scanner/useScannerEvent";
import { useScanSession } from "@/features/scanner/useScanSession";
import { colors, fonts } from "@/theme";

// Door scanner for one assigned event: camera, outcome panel, and undo.
export function ScanScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const { event, loadError, counts, refreshCounts } = useScannerEvent(eventId);
  const session = useScanSession(eventId, event, refreshCounts);
  const { phase } = session;

  function goBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/check-in");
    }
  }

  if (loadError || event === null) {
    return (
      <Screen style={styles.centered} edges={["top", "bottom"]}>
        <Text style={styles.message}>{loadError ?? "This event isn't available to you."}</Text>
        <PrimaryButton label="Back to events" onPress={goBack} />
      </Screen>
    );
  }

  if (event === undefined) {
    return (
      <Screen style={styles.centered}>
        <LoadingState message="Loading event…" />
      </Screen>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <ScanHeader event={event} counts={counts} onBack={goBack} />

      <KeyboardAvoidingView
        style={styles.cameraArea}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <CameraPermissionGate>
          <ScannerCamera onScanned={session.handleScanned} showHint={phase.name === "scanning"} />

          {phase.name === "checking" ? <CheckingPanel /> : null}

          {phase.name === "result" ? (
            <ResultPanel
              result={phase}
              onRetry={session.retry}
              onUndo={() => session.startUndo(phase)}
              onScanNext={session.scanNext}
            />
          ) : null}

          {phase.name === "undo" ? (
            <UndoPanel
              attendeeName={phase.admission.attendeeName}
              reason={session.reason}
              onReasonChange={session.setReason}
              undoing={session.undoing}
              error={session.undoError}
              canUndo={session.canUndo}
              onCancel={() => session.cancelUndo(phase.result)}
              onConfirm={() => session.confirmUndo(phase.admission)}
            />
          ) : null}
        </CameraPermissionGate>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.greenDark,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
  },
  message: {
    color: colors.muted,
    fontFamily: fonts.sans,
    fontSize: 16,
    textAlign: "center",
  },
  cameraArea: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
});
