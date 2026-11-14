import { CameraView, type BarcodeScanningResult } from "expo-camera";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocale } from "@/i18n";
import { t } from "@/i18n";

// Live QR camera filling the scan area, with the aiming hint while idle.
// Render inside CameraPermissionGate.
export function ScannerCamera({
  onScanned,
  showHint,
  onFindGuest,
}: {
  onScanned: (result: BarcodeScanningResult) => void;
  showHint: boolean;
  // Opens manual attendee search; shown with the hint.
  onFindGuest?: () => void;
}) {
  useLocale();
  return (
    <>
      <View style={styles.camera}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={onScanned}
        />
      </View>

      {showHint ? (
        <View style={styles.hint} pointerEvents="box-none">
          <Text style={styles.hintText}>{t("mobile.scan.point_camera")}</Text>
          {onFindGuest ? (
            <Pressable accessibilityRole="button" onPress={onFindGuest} style={styles.findButton}>
              <Text style={styles.findText}>{t("mobile.scan.find_by_name")}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
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
    gap: 10,
  },
  findButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  findText: {
    color: "#174a3b",
    fontSize: 15,
    fontWeight: "700",
  },
  hintText: {
    color: "#fff",
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    overflow: "hidden",
  },
});
