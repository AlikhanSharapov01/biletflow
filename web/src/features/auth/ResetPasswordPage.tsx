import { t, translate, useLocale } from "../../i18n";
import { useState, type FormEvent } from "react";
import * as authApi from "../../api/auth";
import { describeError } from "../../api/errors";
import { Button, ButtonLink } from "../../components/ui/Button";
import { TextField } from "../../components/ui/Field";
import { MissingToken, TokenLayout } from "./components/TokenLayout";
import { TOKEN_FLOW_IDLE, useHashToken, type TokenFlowState } from "./useHashToken";

export function ResetPasswordPage() {
  useLocale();
  const token = useHashToken();
  const [state, setState] = useState<TokenFlowState>(TOKEN_FLOW_IDLE);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const confirmation = String(data.get("confirmation") ?? "");
    if (password !== confirmation) {
      setState({ busy: false, done: false, message: t("auth.passwords_mismatch") });
      return;
    }
    setState({ busy: true, done: false, message: "" });
    try {
      await authApi.resetPassword(token, password);
      setState({ busy: false, done: true, message: t("auth.password_changed") });
    } catch (failure) {
      setState({ busy: false, done: false, message: describeError(failure) });
    }
  };

  return (
    <TokenLayout eyebrow={t("auth.recovery")} title={t("auth.choose_password")}>
      {!token ? (
        <MissingToken action={t("auth.action_reset")} />
      ) : state.done ? (
        <>
          <p className="auth-message success" role="status">
            {translate(state.message)}
          </p>
          <ButtonLink variant="primary" to="/sign-in">{t("auth.sign_in_new_password")}{" "}</ButtonLink>
        </>
      ) : (
        <form className="form-stack" noValidate onSubmit={(event) => void submit(event)}>
          <TextField id="new-password" label={t("auth.new_password")} name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} placeholder={t("auth.minimum_password")} />
          <TextField id="confirm-password" label={t("auth.repeat_password")} name="confirmation" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
          <Button variant="primary" full type="submit" disabled={state.busy}>
            {state.busy ? t("common.saving") : t("auth.set_password")}
          </Button>
          <p className="auth-message" role="status">
            {translate(state.message)}
          </p>
        </form>
      )}
    </TokenLayout>
  );
}
