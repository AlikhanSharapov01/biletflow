import { Redirect, Stack } from "expo-router";

import { useAuth } from "@/features/auth/AuthContext";
import { useLocale } from "@/i18n";

export default function AppLayout() {
  useLocale();
  const { status } = useAuth();

  if (status === "signedOut") {
    return <Redirect href="/login" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
