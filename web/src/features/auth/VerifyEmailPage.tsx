import { t, translate, useLocale } from "../../i18n";
import { useState } from "react";
import * as authApi from "../../api/auth";
import { describeError } from "../../api/errors";
import { Button, ButtonLink } from "../../components/ui/Button";
import { useAuth } from "./AuthContext";
import { MissingToken, TokenLayout } from "./components/TokenLayout";
import { TOKEN_FLOW_IDLE, useHashToken, type TokenFlowState } from "./useHashToken";

export function VerifyEmailPage() {
  useLocale();
  const token = useHashToken();
  const { status, setProfile } = useAuth();
  const [state, setState] = useState<TokenFlowState>(TOKEN_FLOW_IDLE);

  const verify = async () => {
    setState({ busy: true, done: false, message: "" });
    try {
      await authApi.verifyEmail(token);
      if (status === "authenticated") setProfile(await authApi.getProfile());
      setState({ busy: false, done: true, message: t("auth.verified") });
    } catch (failure) {
      setState({ busy: false, done: false, message: describeError(failure) });
    }
  };

  return (
    <TokenLayout eyebrow={t("auth.verification")} title={t("auth.verify_your_email")}>
      {!token ? (
        <MissingToken action={t("auth.action_verify")} />
      ) : (
        <>
          <p className="auth-subtitle">{t("auth.verify_instruction")}</p>
          {state.done ? (
            <ButtonLink variant="primary" to="/sign-in">{t("auth.continue_sign_in")}{" "}</ButtonLink>
          ) : (
            <Button variant="primary" disabled={state.busy} onClick={() => void verify()}>
              {state.busy ? t("auth.verifying") : t("auth.verify_email")}
            </Button>
          )}
          <p className={`auth-message ${state.done ? "success" : ""}`} role="status">
            {translate(state.message)}
          </p>
        </>
      )}
    </TokenLayout>
  );
}
