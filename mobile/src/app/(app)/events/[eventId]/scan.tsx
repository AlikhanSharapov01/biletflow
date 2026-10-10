import { CameraView, type BarcodeScanningResult } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getAssignedEvent, type AssignedEvent } from "@/api/scanner";
import { CameraPermissionGate } from "@/components/CameraPermissionGate";
import { formatEventWindow } from "@/utils/eventTime";

export default function Scan() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  // undefined = still loading, null = not found / not assigned.
  const [event, setEvent] = useState<AssignedEvent | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scanned, setScanned] = useState<string | null>(null);
  // The camera fires onBarcodeScanned for every frame the code is in view;
  // a ref (not state) blocks repeats synchronously until "Scan next".
  const locked = useRef(false);

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
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  function goBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  }

  function handleScanned({ data }: BarcodeScanningResult) {
    if (locked.current) return;
    locked.current = true;
    // The payload is passed on untouched: deciding whether it's a ticket, a
    // campaign QR or an entry confirmation is the server's job (requirements
    // doc §2.2 rule 10, BF-11).
    setScanned(data);
  }

  function scanNext() {
    setScanned(null);
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
          {scanned === null ? (
            <View style={styles.hint} pointerEvents="none">
              <Text style={styles.hintText}>Point the camera at a ticket QR code</Text>
            </View>
          ) : (
            <View style={styles.result}>
              <Text style={styles.resultHeading}>Scanned</Text>
              <Text style={styles.payload} numberOfLines={3} selectable>
                {scanned}
              </Text>
              <Text style={styles.resultNote}>Admission check isn&apos;t connected yet.</Text>
              <Pressable style={styles.button} onPress={scanNext}>
                <Text style={styles.buttonText}>Scan next</Text>
              </Pressable>
            </View>
          )}
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
  result: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  resultHeading: {
    fontSize: 18,
    fontWeight: "600",
  },
  payload: {
    fontFamily: "monospace",
    fontSize: 13,
    color: "#333",
  },
  resultNote: {
    fontSize: 13,
    color: "#666",
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
