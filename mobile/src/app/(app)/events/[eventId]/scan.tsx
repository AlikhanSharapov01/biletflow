import { CameraView, type BarcodeScanningResult } from "expo-camera";
import { randomUUID } from "expo-crypto";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  checkIn,
  getAdmissionCounts,
  getAssignedEvent,
  type AdmissionCounts,
  type AssignedEvent,
} from "@/api/scanner";
import { SessionExpiredError } from "@/api/session";
import { CameraPermissionGate } from "@/components/CameraPermissionGate";
import { describeOutcome, type OutcomeView, type Tone } from "@/scanner/outcomes";
import { formatEventWindow } from "@/utils/eventTime";

// One physical scan. Kept so "Retry" can resend the same operation_id, which
// makes the server return the original admission instead of "already used".
type PendingScan = {
  payload: string;
  operationId: string;
  capturedAt: string;
};

type Phase =
  | { name: "scanning" }
  | { name: "checking" }
  | { name: "result"; view: OutcomeView; retryable: boolean };

function feedback(tone: Tone) {
  if (Platform.OS === "web") return;
  const type =
    tone === "admitted"
      ? Haptics.NotificationFeedbackType.Success
      : tone === "warning"
        ? Haptics.NotificationFeedbackType.Warning
        : Haptics.NotificationFeedbackType.Error;
  Haptics.notificationAsync(type).catch(() => {});
}

export default function Scan() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  // undefined = still loading, null = not found / not assigned.
  const [event, setEvent] = useState<AssignedEvent | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [counts, setCounts] = useState<AdmissionCounts | null>(null);
  const [phase, setPhase] = useState<Phase>({ name: "scanning" });
  // The camera fires onBarcodeScanned for every frame the code is in view;
  // a ref (not state) blocks repeats synchronously until "Scan next".
  const locked = useRef(false);
  const pending = useRef<PendingScan | null>(null);

  const refreshCounts = useCallback(() => {
    getAdmissionCounts(eventId).then(setCounts, () => {
      // Counts are informational; keep showing the last known values.
    });
  }, [eventId]);

  useEffect(() => {
    let cancelled = false;
    getAssignedEvent(eventId).then(
      (result) => {
        if (!cancelled) setEvent(result);
      },
      (err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Something went wrong.");
      }
    );
    refreshCounts();
    return () => {
      cancelled = true;
    };
  }, [eventId, refreshCounts]);

  function goBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  }

  async function submit(scan: PendingScan, timeZone: string) {
    setPhase({ name: "checking" });
    let outcome;
    try {
      // The payload goes to the server untouched: deciding whether it's a
      // ticket, a campaign QR or a forgery is the server's job (BF-11).
      outcome = await checkIn(eventId, scan.payload, scan.operationId, scan.capturedAt);
    } catch (err) {
      // Session couldn't be renewed: AuthContext is already redirecting to login.
      if (err instanceof SessionExpiredError) return;
      outcome = { kind: "network" as const };
    }
    const view = describeOutcome(outcome, timeZone);
    if (outcome.kind === "admitted" && outcome.replayed) {
      view.lines.push("Confirmed after retry.");
    }
    feedback(view.tone);
    setPhase({ name: "result", view, retryable: outcome.kind === "network" });
    if (outcome.kind === "admitted") refreshCounts();
  }

  function handleScanned({ data }: BarcodeScanningResult) {
    if (locked.current || !event) return;
    locked.current = true;
    pending.current = {
      payload: data,
      operationId: randomUUID(),
      capturedAt: new Date().toISOString(),
    };
    submit(pending.current, event.time_zone);
  }

  function retry() {
    if (pending.current && event) submit(pending.current, event.time_zone);
  }

  function scanNext() {
    pending.current = null;
    setPhase({ name: "scanning" });
    locked.current = false;
  }

  if (loadError || event === null) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.message}>{loadError ?? "This event isn't available to you."}</Text>
        <Pressable style={styles.button} onPress={goBack}>
          <Text style={styles.buttonText}>Back to events</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (event === undefined) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={goBack} hitSlop={8}>
          <Text style={styles.back}>‹ Change event</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {event.title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {event.venue.name} · {formatEventWindow(event.starts_at, event.ends_at, event.time_zone)}
        </Text>
        {counts ? (
          <Text style={styles.counts}>
            Admitted {counts.admitted} of {counts.registered}
          </Text>
        ) : null}
      </View>

      <View style={styles.cameraArea}>
        <CameraPermissionGate>
          <View style={styles.camera}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={handleScanned}
            />
          </View>

          {phase.name === "scanning" ? (
            <View style={styles.hint} pointerEvents="none">
              <Text style={styles.hintText}>Point the camera at a ticket QR code</Text>
            </View>
          ) : null}

          {phase.name === "checking" ? (
            <View style={[styles.panel, styles.panelChecking]}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.panelTitle}>Checking…</Text>
            </View>
          ) : null}

          {phase.name === "result" ? (
            <View style={[styles.panel, styles[`panel_${phase.view.tone}`]]}>
              <View style={styles.panelHeader}>
                <Text style={styles.panelIcon}>{phase.view.icon}</Text>
                <Text style={styles.panelTitle}>{phase.view.title}</Text>
              </View>
              {phase.view.lines.map((line, index) => (
                <Text key={index} style={styles.panelLine}>
                  {line}
                </Text>
              ))}
              <View style={styles.panelActions}>
                {phase.retryable ? (
                  <Pressable style={[styles.panelButton, styles.panelButtonSecondary]} onPress={retry}>
                    <Text style={styles.panelButtonText}>Retry</Text>
                  </Pressable>
                ) : null}
                <Pressable style={styles.panelButton} onPress={scanNext}>
                  <Text style={styles.panelButtonText}>Scan next</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </CameraPermissionGate>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  message: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 2,
  },
  back: {
    fontSize: 15,
    fontWeight: "600",
    color: "#208AEF",
    marginBottom: 6,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
  },
  subtitle: {
    fontSize: 13,
    color: "#666",
  },
  counts: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 4,
  },
  cameraArea: {
    flex: 1,
  },
  // Black only behind the live camera; the permission screens draw on the
  // normal background so their dark text stays readable.
  camera: {
    flex: 1,
    backgroundColor: "#000",
  },
  hint: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 24,
    alignItems: "center",
  },
  hintText: {
    color: "#fff",
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    overflow: "hidden",
  },
  // Result panels sit over the bottom of the camera, full width, with white
  // text on a strong colour so the outcome reads from a distance.
  panel: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 16,
    borderRadius: 16,
    padding: 20,
    gap: 6,
  },
  panelChecking: {
    backgroundColor: "#333",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  panel_admitted: {
    backgroundColor: "#1E7B34",
  },
  panel_warning: {
    backgroundColor: "#B45309",
  },
  panel_rejected: {
    backgroundColor: "#B91C1C",
  },
  panel_offline: {
    backgroundColor: "#4B5563",
  },
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
  panelTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "700",
  },
  panelLine: {
    color: "#fff",
    fontSize: 16,
  },
  panelActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 10,
  },
  panelButton: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  panelButtonSecondary: {
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  panelButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  button: {
    backgroundColor: "#208AEF",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
