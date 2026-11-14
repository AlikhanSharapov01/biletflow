import { Redirect, Stack } from "expo-router";

import { useAuth } from "@/features/auth/AuthContext";
import { useLocale } from "@/i18n";

export default function AuthLayout() {
  useLocale();
  const { status } = useAuth();

  if (status === "signedIn") {
    return <Redirect href="/" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
