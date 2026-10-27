import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";

import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ToastProvider } from "@/context/ToastContext";
import { colors } from "@/theme";

function Gate() {
  const { status } = useAuth();

  // Session restore (SecureStore read + possible refresh) hasn't settled
  // yet — hold here rather than flashing the login screen first.
  if (status === "loading") {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.canvas,
        }}
      >
        <ActivityIndicator color={colors.green} />
      </View>
    );
  }

  return <Slot />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <ToastProvider>
        {/* The design is light-only, so dark status-bar text everywhere;
            screens with a dark header override it. */}
        <StatusBar style="dark" />
        <Gate />
      </ToastProvider>
    </AuthProvider>
  );
}
