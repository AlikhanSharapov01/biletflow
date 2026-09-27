import { Redirect, Stack } from "expo-router";

import { useAuth } from "@/context/AuthContext";

export default function AppLayout() {
  const { status } = useAuth();

  if (status === "signedOut") {
    return <Redirect href="/login" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
