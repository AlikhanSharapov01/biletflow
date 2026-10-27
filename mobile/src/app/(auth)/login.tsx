import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { forgotPassword, register } from "@/api/auth";
import {
  Brand,
  Eyebrow,
  PrimaryButton,
  SerifText,
  TextButton,
  TextField,
  fieldStyles,
} from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { colors, fonts } from "@/theme";

type Mode = "login" | "register";

// Mirrors the web sign-in page in its phone layout (web/src/main.js
// authMarkup): a dark-green story header above the sign-in / create-account
// panel. Copy is the web's.
export default function Login() {
  const { login } = useAuth();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; success: boolean } | null>(null);

  const registering = mode === "register";
  const canSubmit =
    email.trim().length > 0 &&
    password.length > 0 &&
    (!registering || name.trim().length > 0) &&
    !submitting;

  function switchMode(next: Mode) {
    setMode(next);
    setMessage(null);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setMessage(null);
    try {
      if (registering) {
        await register(email.trim(), password, name.trim());
        setMessage({
          text: "Account request received. Check your email for the verification link, then sign in.",
          success: true,
        });
      } else {
        await login(email.trim(), password);
        // No navigation call needed: signing in flips AuthContext to
        // "signedIn", and (auth)/_layout's redirect takes it from there.
        return;
      }
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : "Something went wrong.",
        success: false,
      });
    }
    setSubmitting(false);
  }

  async function handleForgot() {
    if (!email.trim()) {
      setMessage({ text: "Enter your email address first.", success: false });
      return;
    }
    try {
      await forgotPassword(email.trim());
      setMessage({
        text: "If the account is eligible, a password reset link will arrive by email.",
        success: true,
      });
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : "Something went wrong.",
        success: false,
      });
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar style="light" />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        <View style={[styles.story, { paddingTop: insets.top + 22 }]}>
          <View style={styles.ring} pointerEvents="none" />
          <Brand inverted />
          <Eyebrow style={styles.storyEyebrow}>A city is better together</Eyebrow>
          <SerifText style={styles.storyTitle}>
            Make room for <Text style={styles.storyAccent}>what matters.</Text>
          </SerifText>
          <Text style={styles.storyCopy}>
            Find your people, bring an idea to life, and make the kind of memories that stay after
            the lights come up.
          </Text>
        </View>

        <View style={[styles.panel, { paddingBottom: insets.bottom + 40 }]}>
          <Eyebrow>Welcome to BiletFlow</Eyebrow>
          <Text style={styles.title}>{registering ? "Create your account" : "Good to see you"}</Text>
          <Text style={styles.subtitle}>
            {registering
              ? "Start discovering events and bringing people together."
              : "Sign in to pick up right where your plans left off."}
          </Text>

          <View style={styles.tabs} accessibilityRole="tablist">
            {(["login", "register"] as const).map((tab) => (
              <Pressable
                key={tab}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === tab }}
                onPress={() => switchMode(tab)}
                style={[styles.tab, mode === tab && styles.tabActive]}
              >
                <Text style={[styles.tabText, mode === tab && styles.tabTextActive]}>
                  {tab === "login" ? "Sign in" : "Create account"}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.form}>
            {registering ? (
              <TextField
                label="Your name"
                placeholder="e.g. Aida Sarsen"
                autoComplete="name"
                textContentType="name"
                maxLength={100}
                value={name}
                onChangeText={setName}
                editable={!submitting}
              />
            ) : null}
            <TextField
              label="Email address"
              placeholder="you@example.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="username"
              maxLength={254}
              value={email}
              onChangeText={setEmail}
              editable={!submitting}
            />
            <View style={styles.passwordField}>
              <Text style={fieldStyles.label}>Password</Text>
              <View style={[fieldStyles.box, styles.passwordRow]}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder={registering ? "At least 12 characters" : "Enter your password"}
                  placeholderTextColor={colors.placeholder}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType={registering ? "newPassword" : "password"}
                  maxLength={128}
                  value={password}
                  onChangeText={setPassword}
                  editable={!submitting}
                />
                <TextButton
                  label={showPassword ? "Hide" : "Show"}
                  onPress={() => setShowPassword((shown) => !shown)}
                />
              </View>
            </View>
            {registering ? (
              <Text style={styles.note}>
                Use at least 12 characters. We’ll email you a verification link.
              </Text>
            ) : (
              <TextButton
                label="Forgot password?"
                onPress={handleForgot}
                style={styles.forgot}
              />
            )}

            <PrimaryButton
              label={registering ? "Create account →" : "Sign in →"}
              onPress={handleSubmit}
              disabled={!canSubmit}
              loading={submitting}
            />
            {message ? (
              <Text
                style={[styles.message, message.success && styles.messageSuccess]}
                accessibilityLiveRegion="polite"
              >
                {message.text}
              </Text>
            ) : null}
          </View>

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
  story: {
    overflow: "hidden",
    paddingHorizontal: 24,
    paddingBottom: 32,
    backgroundColor: colors.greenStory,
  },
  // One of the web's concentric circles (.auth-story::before).
  ring: {
    position: "absolute",
    top: 70,
    right: -150,
    width: 320,
    height: 320,
    borderWidth: 1,
    borderColor: "rgba(226,244,191,0.17)",
    borderRadius: 160,
  },
  storyEyebrow: {
    marginTop: 34,
    color: "#bbd5b3",
  },
  storyTitle: {
    marginTop: 14,
    color: colors.paper,
    fontSize: 42,
    letterSpacing: -1.5,
    lineHeight: 46,
  },
  storyAccent: {
    color: colors.lime,
  },
  storyCopy: {
    maxWidth: 350,
    marginTop: 14,
    color: "#d1ddd2",
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 22,
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
  tabs: {
    flexDirection: "row",
    gap: 4,
    padding: 4,
    marginBottom: 22,
    borderRadius: 9,
    backgroundColor: colors.tabTrack,
  },
  tab: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  tabActive: {
    backgroundColor: colors.paper,
    shadowColor: colors.ink,
    shadowOpacity: 0.09,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  tabText: {
    color: "#78817c",
    fontFamily: fonts.sans,
    fontSize: 14,
    fontWeight: "600",
  },
  tabTextActive: {
    color: colors.ink,
  },
  form: {
    gap: 14,
  },
  passwordField: {
    gap: 7,
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  passwordInput: {
    flex: 1,
    minHeight: 44,
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 15,
  },
  note: {
    marginTop: -6,
    color: "#818b84",
    fontFamily: fonts.sans,
    fontSize: 12,
  },
  forgot: {
    alignSelf: "flex-end",
    marginTop: -4,
  },
  message: {
    color: colors.error,
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
  },
  messageSuccess: {
    color: colors.green,
  },
  legal: {
    marginTop: 26,
    color: "#9ba29c",
    fontFamily: fonts.sans,
    fontSize: 11,
    lineHeight: 17,
  },
});
