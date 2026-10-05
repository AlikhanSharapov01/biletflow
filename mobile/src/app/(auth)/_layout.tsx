import { Redirect, Stack } from "expo-router";

import { useAuth } from "@/context/AuthContext";

export default function AuthLayout() {
  const { status } = useAuth();

  if (status === "signedIn") {
    // expo-router's typed-routes codegen calls this route "/index" here
    // (two sibling top-level groups make it avoid the bare "/" alias), but
    // that literal path 404s at runtime — confirmed by hand: "/" is the one
    // that actually resolves to (app)/index.tsx.
    // @ts-expect-error -- generated route types are wrong for this case.
    return <Redirect href="/" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
