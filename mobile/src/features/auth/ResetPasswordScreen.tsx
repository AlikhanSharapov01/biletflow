import { useRouter } from "expo-router";
import { useState } from "react";

import { resetPassword } from "@/api/account";
import { describeError } from "@/api/errors";
import { PrimaryButton, TextField } from "@/components/ui";
import { LinkTokenField } from "@/features/auth/components/LinkTokenField";
import { TokenLayout, TokenMessage } from "@/features/auth/components/TokenLayout";
import { TOKEN_FLOW_IDLE, useLinkToken, type TokenFlowState } from "@/features/auth/useLinkToken";
import { t, useLocale } from "@/i18n";

// Sets a new password with the token from the reset email (web ResetPasswordPage).
export function ResetPasswordScreen() {
  useLocale();
  const router = useRouter();
  const link = useLinkToken();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [state, setState] = useState<TokenFlowState>(TOKEN_FLOW_IDLE);

  async function submit() {
    if (password !== confirmation) {
      setState({ busy: false, done: false, message: t("auth.passwords_mismatch") });
      return;
    }
    if (password.length < 12) {
      setState({ busy: false, done: false, message: t("mobile.auth.password_length") });
      return;
    }
    setState({ busy: true, done: false, message: "" });
    try {
      await resetPassword(link.token, password);
      setState({ busy: false, done: true, message: t("auth.password_changed") });
    } catch (failure) {
      setState({ busy: false, done: false, message: describeError(failure) });
    }
  }

  if (state.done) {
    return (
      <TokenLayout eyebrow={t("auth.recovery")} title={t("auth.choose_password")} subtitle={t("mobile.auth.password_changed")}>
        <TokenMessage text={state.message} success />
        <PrimaryButton label={t("auth.sign_in_new_password")} onPress={() => router.replace("/login")} />
      </TokenLayout>
    );
  }

  return (
    <TokenLayout
      eyebrow={t("auth.recovery")}
      title={t("auth.choose_password")}
      subtitle={t("mobile.auth.reset_intro")}
    >
      <LinkTokenField
        value={link.input}
        onChange={link.setInput}
        missing={link.missing}
        action={t("auth.action_reset")}
        editable={!state.busy}
      />
      <TextField
        label={t("auth.new_password")}
        placeholder={t("auth.minimum_password")}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        maxLength={128}
        value={password}
        onChangeText={setPassword}
        editable={!state.busy}
      />
      <TextField
        label={t("auth.repeat_password")}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        maxLength={128}
        value={confirmation}
        onChangeText={setConfirmation}
        editable={!state.busy}
      />
      <PrimaryButton
        label={state.busy ? t("common.saving") : t("auth.set_password")}
        onPress={() => void submit()}
        disabled={!link.token || !password || !confirmation}
        loading={state.busy}
      />
      <TokenMessage text={state.message} success={false} />
    </TokenLayout>
  );
}
