import { useRouter } from "expo-router";
import { useState } from "react";

import { verifyEmail } from "@/api/account";
import { describeError } from "@/api/errors";
import { PrimaryButton } from "@/components/ui";
import { LinkTokenField } from "@/features/auth/components/LinkTokenField";
import { TokenLayout, TokenMessage } from "@/features/auth/components/TokenLayout";
import { TOKEN_FLOW_IDLE, useLinkToken, type TokenFlowState } from "@/features/auth/useLinkToken";

// Confirms an email address with the token from the verification email
// (web VerifyEmailPage). Reached from the sign-in screen while signed out.
export function VerifyEmailScreen() {
  const router = useRouter();
  const link = useLinkToken();
  const [state, setState] = useState<TokenFlowState>(TOKEN_FLOW_IDLE);

  async function verify() {
    setState({ busy: true, done: false, message: "" });
    try {
      await verifyEmail(link.token);
      setState({ busy: false, done: true, message: "Your email is verified. You can sign in now." });
    } catch (failure) {
      setState({ busy: false, done: false, message: describeError(failure) });
    }
  }

  return (
    <TokenLayout
      eyebrow="Account verification"
      title="Verify your email"
      subtitle="Paste the link from your verification email, then press the button to confirm this email address for your BiletFlow account."
    >
      {state.done ? null : (
        <LinkTokenField
          value={link.input}
          onChange={(next) => {
            link.setInput(next);
            setState(TOKEN_FLOW_IDLE);
          }}
          missing={link.missing}
          action="verify your email"
          editable={!state.busy}
        />
      )}
      {state.done ? (
        <PrimaryButton label="Continue to sign in" onPress={() => router.replace("/login")} />
      ) : (
        <PrimaryButton
          label={state.busy ? "Verifying…" : "Verify email"}
          onPress={() => void verify()}
          disabled={!link.token}
          loading={state.busy}
        />
      )}
      <TokenMessage text={state.message} success={state.done} />
    </TokenLayout>
  );
}
