import { StyleSheet, Text, View } from "react-native";

import { PrimaryButton, TextButton, TextField } from "@/components/ui";
import { PasswordField } from "@/features/auth/PasswordField";
import type { AuthFormState } from "@/features/auth/useAuthForm";
import { colors, fonts } from "@/theme";
import { t, useLocale } from "@/i18n";

// One form for both modes: register adds the name field and the password
// note; sign-in offers "Forgot password?" (which reuses the email field).
// Kept as a single tree so the email/password inputs stay mounted — and
// keep focus — when the user switches tabs.
export function AuthForm({ form }: { form: AuthFormState }) {
  useLocale();
  const { registering, submitting, message } = form;

  return (
    <View style={styles.form}>
      {registering ? (
        <TextField
          label={t("auth.your_name")}
          placeholder={t("auth.name_example")}
          autoComplete="name"
          textContentType="name"
          maxLength={100}
          value={form.name}
          onChangeText={form.setName}
          editable={!submitting}
        />
      ) : null}
      <TextField
        label={t("auth.email_address")}
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
          {t("auth.password_hint")}
        </Text>
      ) : (
        <TextButton label={t("auth.forgot_password")} onPress={form.handleForgot} style={styles.forgot} />
      )}

      <PrimaryButton
        label={registering ? t("mobile.auth.create_account_arrow") : t("mobile.auth.sign_in_arrow")}
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
