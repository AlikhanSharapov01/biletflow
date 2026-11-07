import { StatusBar } from "expo-status-bar";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Eyebrow } from "@/components/ui";
import { AuthForm } from "@/features/auth/AuthForm";
import { AuthModeTabs } from "@/features/auth/AuthModeTabs";
import { AuthStory } from "@/features/auth/AuthStory";
import { useAuthForm } from "@/features/auth/useAuthForm";
import { colors, fonts } from "@/theme";

// Mirrors the web sign-in page in its phone layout (web/src/main.js
// authMarkup): a dark-green story header above the sign-in / create-account
// panel. Copy is the web's.
export function LoginScreen() {
  const insets = useSafeAreaInsets();
  const form = useAuthForm();
  const { registering } = form;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar style="light" />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        <AuthStory topInset={insets.top} />

        <View style={[styles.panel, { paddingBottom: insets.bottom + 40 }]}>
          <Eyebrow>Welcome to BiletFlow</Eyebrow>
          <Text style={styles.title}>{registering ? "Create your account" : "Good to see you"}</Text>
          <Text style={styles.subtitle}>
            {registering
              ? "Start discovering events and bringing people together."
              : "Sign in to pick up right where your plans left off."}
          </Text>

          <AuthModeTabs mode={form.mode} onChange={form.switchMode} />

          <AuthForm form={form} />

          <Text style={styles.legal}>
            By continuing, you agree to our Terms of Service and Privacy Policy.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  scroll: {
    flexGrow: 1,
  },
  panel: {
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  title: {
    marginTop: 6,
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -1,
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 22,
    color: "#75817b",
    fontFamily: fonts.sans,
    fontSize: 14,
  },
  legal: {
    marginTop: 26,
    color: "#9ba29c",
    fontFamily: fonts.sans,
    fontSize: 11,
    lineHeight: 17,
  },
});
