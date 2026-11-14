import { PermissionStatus, useCameraPermissions } from "expo-camera";
import { useEffect, type ReactNode } from "react";
import { AppState, Linking, Platform, StyleSheet, Text, View } from "react-native";

import { LoadingState, PrimaryButton, SerifText } from "@/components/ui";
import { colors, fonts } from "@/theme";
import { t, useLocale } from "@/i18n";

// Renders children only once camera access is granted; otherwise walks the
// user through granting it.
export function CameraPermissionGate({ children }: { children: ReactNode }) {
  useLocale();
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
        <LoadingState message={t("mobile.scan.checking_camera")} />
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
        <SerifText style={styles.heading}>{t("mobile.scan.camera_needed")}</SerifText>
        <Text style={styles.body}>
          {t("mobile.scan.camera_why")}
        </Text>
        <PrimaryButton label={t("mobile.scan.allow_camera")} onPress={requestPermission} />
      </View>
    );
  }

  // Denied for good: the OS (or browser) won't show the prompt again, so the
  // only way forward is the system settings.
  return (
    <View style={styles.container}>
      <SerifText style={styles.heading}>{t("mobile.scan.camera_off")}</SerifText>
      {Platform.OS === "web" ? (
        <Text style={styles.body}>
          {t("mobile.scan.camera_off_web")}
        </Text>
      ) : (
        <>
          <Text style={styles.body}>
            {t("mobile.scan.camera_off_app")}
          </Text>
          <PrimaryButton label={t("mobile.scan.open_settings")} onPress={() => Linking.openSettings()} />
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
    gap: 14,
    backgroundColor: colors.canvas,
  },
  heading: {
    fontSize: 26,
    textAlign: "center",
  },
  body: {
    maxWidth: 320,
    color: colors.muted,
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
});
