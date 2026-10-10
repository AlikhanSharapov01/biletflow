import { PermissionStatus, useCameraPermissions } from "expo-camera";
import { useEffect, type ReactNode } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

// Renders children only once camera access is granted; otherwise walks the
// user through granting it.
export function CameraPermissionGate({ children }: { children: ReactNode }) {
  const [permission, requestPermission, getPermission] = useCameraPermissions();

  // Granting access in system Settings happens outside the app; re-read the
  // status when the app comes back to the foreground so the camera appears
  // without a restart.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        getPermission();
      }
    });
    return () => subscription.remove();
  }, [getPermission]);

  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator />
      </View>
    );
  }

  if (permission.granted) {
    return <>{children}</>;
  }

  // expo-camera's web implementation always reports canAskAgain: true, but a
  // browser never re-prompts once the user has blocked the camera — so on web
  // a "denied" status is final.
  const blocked =
    !permission.canAskAgain ||
    (Platform.OS === "web" && permission.status === PermissionStatus.DENIED);

  if (!blocked) {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>Camera access needed</Text>
        <Text style={styles.body}>
          BiletFlow uses the camera to scan ticket QR codes at the entrance. Nothing is
          recorded or stored.
        </Text>
        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Allow camera</Text>
        </Pressable>
      </View>
    );
  }

  // Denied for good: the OS (or browser) won't show the prompt again, so the
  // only way forward is the system settings.
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Camera access is turned off</Text>
      {Platform.OS === "web" ? (
        <Text style={styles.body}>
          Allow camera access for this site in your browser&apos;s settings, then reload the
          page.
        </Text>
      ) : (
        <>
          <Text style={styles.body}>
            Turn on camera access for this app in Settings to scan tickets.
          </Text>
          <Pressable style={styles.button} onPress={() => Linking.openSettings()}>
            <Text style={styles.buttonText}>Open Settings</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  heading: {
    fontSize: 22,
    fontWeight: "600",
    textAlign: "center",
  },
  body: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    maxWidth: 320,
  },
  button: {
    backgroundColor: "#208AEF",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 8,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
