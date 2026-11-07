import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import * as authApi from "../../api/auth";
import { describeError, errorCodeOf } from "../../api/errors";
import { Button } from "../../components/ui/Button";
import { Tabs } from "../../components/ui/Tabs";
import { useAuth } from "./AuthContext";
import { AuthStory } from "./components/AuthStory";
import { CredentialsForm, type AuthFeedback } from "./components/CredentialsForm";

type Mode = "login" | "register";

const MODES = [
  { id: "login" as const, label: "Sign in" },
  { id: "register" as const, label: "Create account" },
];

function fieldValue(form: HTMLFormElement, name: string): string {
  const field = form.elements.namedItem(name);
  return field instanceof HTMLInputElement ? field.value : "";
}

export function AuthPage() {
  const { status, notice, clearNotice, signIn, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<Mode>("login");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<AuthFeedback>({ text: "", success: false });
  // Set when sign-in failed because the email is unverified, so we can offer a resend.
  const [unverifiedEmail, setUnverifiedEmail] = useState("");

  const registering = mode === "register";
  const from = (location.state as { from?: string } | null)?.from ?? "/discover";

  // A notice from AuthProvider (session expiry, Google errors) is shown once.
  useEffect(() => {
    if (notice) {
      setFeedback({ text: notice, success: false });
      clearNotice();
    }
  }, [notice, clearNotice]);

  if (status === "authenticated") return <Navigate to={from} replace />;

  const switchMode = (next: Mode) => {
    setMode(next);
    setFeedback({ text: "", success: false });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = fieldValue(form, "email").trim();
    const password = fieldValue(form, "password");
    setBusy(true);
    setFeedback({ text: "", success: false });
    setUnverifiedEmail("");
    try {
      if (registering) {
        await register({ email, password, display_name: fieldValue(form, "display_name").trim(), locale: "en" });
        setFeedback({
          text: "Account request received. Check your email for the verification link, then sign in.",
          success: true,
        });
      } else {
        await signIn({ email, password });
        navigate(from, { replace: true });
      }
    } catch (failure) {
      setFeedback({ text: describeError(failure), success: false });
      if (errorCodeOf(failure) === "email_not_verified") setUnverifiedEmail(email);
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    try {
      await authApi.resendVerification(unverifiedEmail);
      setFeedback({ text: "A new verification link is on its way. Check your inbox.", success: true });
      setUnverifiedEmail("");
    } catch (failure) {
      setFeedback({ text: describeError(failure), success: false });
    }
  };

  const handleForgot = async (form: HTMLFormElement | null) => {
    const email = form ? fieldValue(form, "email").trim() : "";
    if (!email) {
      setFeedback({ text: "Enter your email address first.", success: false });
      return;
    }
    try {
      await authApi.requestPasswordReset(email);
      setFeedback({ text: "If the account is eligible, a password reset link will arrive by email.", success: true });
    } catch (failure) {
      setFeedback({ text: describeError(failure), success: false });
    }
  };

  const handleGoogle = async () => {
    setBusy(true);
    setFeedback({ text: "Connecting to Google…", success: false });
    try {
      const { authorization_url } = await authApi.startGoogleSignIn();
      window.location.assign(authorization_url);
    } catch (failure) {
      setFeedback({ text: describeError(failure), success: false });
      setBusy(false);
    }
  };

  return (
    <main className="auth-screen">
      <AuthStory />
      <section className="auth-panel">
        <div className="auth-box">
          <p className="eyebrow">Welcome to BiletFlow</p>
          <h2>{registering ? "Create your account" : "Good to see you"}</h2>
          <p className="auth-subtitle">
            {registering
              ? "Start discovering events and bringing people together."
              : "Sign in to pick up right where your plans left off."}
          </p>
          <Tabs label="Account access" items={MODES} value={mode} onChange={switchMode} fill />
          <CredentialsForm
            registering={registering}
            busy={busy}
            feedback={feedback}
            canResend={Boolean(unverifiedEmail)}
            onSubmit={(event) => void handleSubmit(event)}
            onForgot={(form) => void handleForgot(form)}
            onResend={() => void handleResend()}
          />
          {!registering ? (
            <button className="google-button" type="button" disabled={busy} onClick={() => void handleGoogle()}>
              <span className="google-mark" aria-hidden="true">
                G
              </span>
              Continue with Google
            </button>
          ) : null}
          <div className="divider">OR</div>
          <Button full onClick={() => navigate("/discover")}>
            Browse events without signing in
          </Button>
          <p className="auth-legal">By continuing, you agree to our Terms of Service and Privacy Policy.</p>
        </div>
      </section>
    </main>
  );
}
