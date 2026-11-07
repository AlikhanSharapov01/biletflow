import { StyleSheet, Text, View } from "react-native";

import { PrimaryButton, TextButton, TextField } from "@/components/ui";
import { PasswordField } from "@/features/auth/PasswordField";
import type { AuthFormState } from "@/features/auth/useAuthForm";
import { colors, fonts } from "@/theme";

// One form for both modes: register adds the name field and the password
// note; sign-in offers "Forgot password?" (which reuses the email field).
// Kept as a single tree so the email/password inputs stay mounted — and
// keep focus — when the user switches tabs.
export function AuthForm({ form }: { form: AuthFormState }) {
  const { registering, submitting, message } = form;

  return (
    <View style={styles.form}>
      {registering ? (
        <TextField
          label="Your name"
          placeholder="e.g. Aida Sarsen"
          autoComplete="name"
          textContentType="name"
          maxLength={100}
          value={form.name}
          onChangeText={form.setName}
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
        value={form.email}
        onChangeText={form.setEmail}
        editable={!submitting}
      />
      <PasswordField
        value={form.password}
        onChangeText={form.setPassword}
        shown={form.showPassword}
        onToggleShown={form.toggleShowPassword}
        isNew={registering}
        editable={!submitting}
      />
      {registering ? (
        <Text style={styles.note}>
          Use at least 12 characters. We’ll email you a verification link.
        </Text>
      ) : (
        <TextButton label="Forgot password?" onPress={form.handleForgot} style={styles.forgot} />
      )}

      <PrimaryButton
        label={registering ? "Create account →" : "Sign in →"}
        onPress={form.handleSubmit}
        disabled={!form.canSubmit}
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
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 14,
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
});
