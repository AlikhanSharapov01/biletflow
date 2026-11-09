import { t, translate, useLocale } from "../../../i18n";
import type { FormEvent } from "react";
import { Button } from "../../../components/ui/Button";
import { TextField } from "../../../components/ui/Field";

export interface AuthFeedback {
  text: string;
  success: boolean;
}

interface CredentialsFormProps {
  registering: boolean;
  busy: boolean;
  feedback: AuthFeedback;
  // Offer to resend verification after an "email not verified" failure.
  canResend: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onForgot: (form: HTMLFormElement | null) => void;
  onResend: () => void;
}

// Email/password fields for both sign-in and registration.
export function CredentialsForm({ registering, busy, feedback, canResend, onSubmit, onForgot, onResend }: CredentialsFormProps) {
  useLocale();
  return (
    <form id="auth-form" className="form-stack" noValidate onSubmit={onSubmit}>
      {registering ? (
        <TextField id="display-name" label={t("auth.your_name")} name="display_name" autoComplete="name" placeholder={t("auth.name_example")} required maxLength={100} />
      ) : null}
      <TextField id="email" label={t("auth.email_address")} name="email" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={254} />
      <TextField
        id="password"
        label={t("common.password")}
        name="password"
        type="password"
        autoComplete={registering ? "new-password" : "current-password"}
        placeholder={registering ? t("auth.minimum_password") : t("auth.enter_password")}
        required
        maxLength={128}
        minLength={registering ? 12 : 1}
      />
      {registering ? (
        <p className="field-note">{t("auth.password_hint")}</p>
      ) : (
        <div className="auth-row">
          <Button variant="text" onClick={(event) => onForgot(event.currentTarget.form)}>{t("auth.forgot_password")}</Button>
        </div>
      )}
      <Button variant="primary" full type="submit" disabled={busy}>
        {busy ? (registering ? t("auth.creating") : t("auth.signing_in")) : registering ? t("auth.create_account") : t("auth.sign_in")}
        <span aria-hidden="true">→</span>
      </Button>
      <p className={`auth-message ${feedback.success ? "success" : ""}`} role="status">
        {translate(feedback.text)}
      </p>
      {canResend ? (
        <p className="resend-row">
          <Button variant="text" onClick={onResend}>{t("auth.resend_verification")}{" "}</Button>
        </p>
      ) : null}
    </form>
  );
}
