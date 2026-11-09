import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Screen } from "@/components/layout";
import { LoadingState, PrimaryButton } from "@/components/ui";
import { CameraPermissionGate } from "@/features/scanner/CameraPermissionGate";
import { AttendeeSearchPanel } from "@/features/scanner/AttendeeSearchPanel";
import { CheckingPanel } from "@/features/scanner/CheckingPanel";
import { ConfirmationPanel } from "@/features/scanner/ConfirmationPanel";
import { OfflineBar } from "@/features/scanner/OfflineBar";
import { ResultPanel } from "@/features/scanner/ResultPanel";
import { ScanHeader } from "@/features/scanner/ScanHeader";
import { ScannerCamera } from "@/features/scanner/ScannerCamera";
import { UndoPanel } from "@/features/scanner/UndoPanel";
import { useOfflineScanning } from "@/features/scanner/useOfflineScanning";
import { useScannerEvent } from "@/features/scanner/useScannerEvent";
import { useScanSession } from "@/features/scanner/useScanSession";
import { colors, fonts } from "@/theme";

// Door scanner for one assigned event: camera, outcome panel, entry
// confirmation, manual guest search and undo.
export function ScanScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const { event: liveEvent, loadError: liveError, counts, refreshCounts } = useScannerEvent(eventId);
  const offline = useOfflineScanning(eventId, refreshCounts);
  // With no connection the event comes from the saved offline list.
  const savedEvent = liveError ? offline.savedEvent : null;
  const event = savedEvent ?? liveEvent;
  const loadError = savedEvent || !offline.loaded ? null : liveError;
  const session = useScanSession(eventId, event, refreshCounts, offline);
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
      <OfflineBar offline={offline} event={event} />

      <KeyboardAvoidingView
        style={styles.cameraArea}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <CameraPermissionGate>
          <ScannerCamera
            onScanned={session.handleScanned}
            showHint={phase.name === "scanning"}
            onFindGuest={session.openSearch}
          />

          {phase.name === "confirm" ? (
            <ConfirmationPanel
              error={phase.error}
              onSubmitCode={session.submitEntryCode}
              onCancel={session.scanNext}
            />
          ) : null}

          {phase.name === "search" ? (
            <AttendeeSearchPanel
              eventId={eventId}
              onCheckIn={session.checkInAttendee}
              onClose={session.scanNext}
            />
          ) : null}

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
