import { Redirect, Stack } from "expo-router";

import { useAuth } from "@/features/auth/AuthContext";

export default function AuthLayout() {
  const { status } = useAuth();

  if (status === "signedIn") {
    return <Redirect href="/" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
