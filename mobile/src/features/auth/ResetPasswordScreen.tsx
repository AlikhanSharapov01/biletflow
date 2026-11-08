import { useRouter } from "expo-router";
import { useState } from "react";

import { resetPassword } from "@/api/account";
import { describeError } from "@/api/errors";
import { PrimaryButton, TextField } from "@/components/ui";
import { LinkTokenField } from "@/features/auth/components/LinkTokenField";
import { TokenLayout, TokenMessage } from "@/features/auth/components/TokenLayout";
import { TOKEN_FLOW_IDLE, useLinkToken, type TokenFlowState } from "@/features/auth/useLinkToken";

// Sets a new password with the token from the reset email (web ResetPasswordPage).
export function ResetPasswordScreen() {
  const router = useRouter();
  const link = useLinkToken();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [state, setState] = useState<TokenFlowState>(TOKEN_FLOW_IDLE);

  async function submit() {
    if (password !== confirmation) {
      setState({ busy: false, done: false, message: "The two passwords do not match." });
      return;
    }
    if (password.length < 12) {
      setState({ busy: false, done: false, message: "Use at least 12 characters." });
      return;
    }
    setState({ busy: true, done: false, message: "" });
    try {
      await resetPassword(link.token, password);
      setState({ busy: false, done: true, message: "Password changed. Every other session was signed out." });
    } catch (failure) {
      setState({ busy: false, done: false, message: describeError(failure) });
    }
  }

  if (state.done) {
    return (
      <TokenLayout eyebrow="Account recovery" title="Choose a new password" subtitle="Your BiletFlow password was changed.">
        <TokenMessage text={state.message} success />
        <PrimaryButton label="Sign in with the new password" onPress={() => router.replace("/login")} />
      </TokenLayout>
    );
  }

  return (
    <TokenLayout
      eyebrow="Account recovery"
      title="Choose a new password"
      subtitle="Paste the link from your password reset email, then choose a new password."
    >
      <LinkTokenField
        value={link.input}
        onChange={link.setInput}
        missing={link.missing}
        action="reset your password"
        editable={!state.busy}
      />
      <TextField
        label="New password"
        placeholder="At least 12 characters"
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        maxLength={128}
        value={password}
        onChangeText={setPassword}
        editable={!state.busy}
      />
      <TextField
        label="Repeat password"
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        maxLength={128}
        value={confirmation}
        onChangeText={setConfirmation}
        editable={!state.busy}
      />
      <PrimaryButton
        label={state.busy ? "Saving…" : "Set new password"}
        onPress={() => void submit()}
        disabled={!link.token || !password || !confirmation}
        loading={state.busy}
      />
      <TokenMessage text={state.message} success={false} />
    </TokenLayout>
  );
}
