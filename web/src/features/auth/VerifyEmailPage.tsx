import { useState } from "react";
import * as authApi from "../../api/auth";
import { describeError } from "../../api/errors";
import { Button, ButtonLink } from "../../components/ui/Button";
import { useAuth } from "./AuthContext";
import { MissingToken, TokenLayout } from "./components/TokenLayout";
import { TOKEN_FLOW_IDLE, useHashToken, type TokenFlowState } from "./useHashToken";

export function VerifyEmailPage() {
  const token = useHashToken();
  const { status, setProfile } = useAuth();
  const [state, setState] = useState<TokenFlowState>(TOKEN_FLOW_IDLE);

  const verify = async () => {
    setState({ busy: true, done: false, message: "" });
    try {
      await authApi.verifyEmail(token);
      if (status === "authenticated") setProfile(await authApi.getProfile());
      setState({ busy: false, done: true, message: "Your email is verified. You can sign in now." });
    } catch (failure) {
      setState({ busy: false, done: false, message: describeError(failure) });
    }
  };

  return (
    <TokenLayout eyebrow="Account verification" title="Verify your email">
      {!token ? (
        <MissingToken action="verify your email" />
      ) : (
        <>
          <p className="auth-subtitle">Press the button to confirm this email address for your BiletFlow account.</p>
          {state.done ? (
            <ButtonLink variant="primary" to="/sign-in">
              Continue to sign in
            </ButtonLink>
          ) : (
            <Button variant="primary" disabled={state.busy} onClick={() => void verify()}>
              {state.busy ? "Verifying…" : "Verify email"}
            </Button>
          )}
          <p className={`auth-message ${state.done ? "success" : ""}`} role="status">
            {state.message}
          </p>
        </>
      )}
    </TokenLayout>
  );
}
