import { CameraView, type BarcodeScanningResult } from "expo-camera";
import { StyleSheet, Text, View } from "react-native";

// Live QR camera filling the scan area, with the aiming hint while idle.
// Render inside CameraPermissionGate.
export function ScannerCamera({
  onScanned,
  showHint,
}: {
  onScanned: (result: BarcodeScanningResult) => void;
  showHint: boolean;
}) {
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
        <View style={styles.hint} pointerEvents="none">
          <Text style={styles.hintText}>Point the camera at a ticket QR code</Text>
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
