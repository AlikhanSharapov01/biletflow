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
  return (
    <form id="auth-form" className="form-stack" noValidate onSubmit={onSubmit}>
      {registering ? (
        <TextField id="display-name" label="Your name" name="display_name" autoComplete="name" placeholder="e.g. Aida Sarsen" required maxLength={100} />
      ) : null}
      <TextField id="email" label="Email address" name="email" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={254} />
      <TextField
        id="password"
        label="Password"
        name="password"
        type="password"
        autoComplete={registering ? "new-password" : "current-password"}
        placeholder={registering ? "At least 12 characters" : "Enter your password"}
        required
        maxLength={128}
        minLength={registering ? 12 : 1}
      />
      {registering ? (
        <p className="field-note">Use at least 12 characters. We’ll email you a verification link.</p>
      ) : (
        <div className="auth-row">
          <Button variant="text" onClick={(event) => onForgot(event.currentTarget.form)}>
            Forgot password?
          </Button>
        </div>
      )}
      <Button variant="primary" full type="submit" disabled={busy}>
        {busy ? (registering ? "Creating account…" : "Signing in…") : registering ? "Create account" : "Sign in"}
        <span aria-hidden="true">→</span>
      </Button>
      <p className={`auth-message ${feedback.success ? "success" : ""}`} role="status">
        {feedback.text}
      </p>
      {canResend ? (
        <p className="resend-row">
          <Button variant="text" onClick={onResend}>
            Resend the verification email
          </Button>
        </p>
      ) : null}
    </form>
  );
}
