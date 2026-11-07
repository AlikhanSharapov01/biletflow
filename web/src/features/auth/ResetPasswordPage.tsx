import { useState, type FormEvent } from "react";
import * as authApi from "../../api/auth";
import { describeError } from "../../api/errors";
import { Button, ButtonLink } from "../../components/ui/Button";
import { TextField } from "../../components/ui/Field";
import { MissingToken, TokenLayout } from "./components/TokenLayout";
import { TOKEN_FLOW_IDLE, useHashToken, type TokenFlowState } from "./useHashToken";

export function ResetPasswordPage() {
  const token = useHashToken();
  const [state, setState] = useState<TokenFlowState>(TOKEN_FLOW_IDLE);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const confirmation = String(data.get("confirmation") ?? "");
    if (password !== confirmation) {
      setState({ busy: false, done: false, message: "The two passwords do not match." });
      return;
    }
    setState({ busy: true, done: false, message: "" });
    try {
      await authApi.resetPassword(token, password);
      setState({ busy: false, done: true, message: "Password changed. Every other session was signed out." });
    } catch (failure) {
      setState({ busy: false, done: false, message: describeError(failure) });
    }
  };

  return (
    <TokenLayout eyebrow="Account recovery" title="Choose a new password">
      {!token ? (
        <MissingToken action="reset your password" />
      ) : state.done ? (
        <>
          <p className="auth-message success" role="status">
            {state.message}
          </p>
          <ButtonLink variant="primary" to="/sign-in">
            Sign in with the new password
          </ButtonLink>
        </>
      ) : (
        <form className="form-stack" noValidate onSubmit={(event) => void submit(event)}>
          <TextField id="new-password" label="New password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} placeholder="At least 12 characters" />
          <TextField id="confirm-password" label="Repeat password" name="confirmation" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
          <Button variant="primary" full type="submit" disabled={state.busy}>
            {state.busy ? "Saving…" : "Set new password"}
          </Button>
          <p className="auth-message" role="status">
            {state.message}
          </p>
        </form>
      )}
    </TokenLayout>
  );
}
