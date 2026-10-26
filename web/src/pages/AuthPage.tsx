import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import * as authApi from "../api/auth";
import { describeError, errorCodeOf } from "../api/errors";
import { useAuth } from "../auth/AuthContext";

type Mode = "login" | "register";

interface Feedback {
  text: string;
  success: boolean;
}

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
  const [feedback, setFeedback] = useState<Feedback>({ text: "", success: false });
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
      <section className="auth-story" aria-label="BiletFlow introduction">
        <span className="brand">
          <span className="brand-mark">b</span>BiletFlow
        </span>
        <div className="story-copy">
          <p className="eyebrow">A city is better together</p>
          <h1 className="serif">
            Make room for <em>what matters.</em>
          </h1>
          <p>Find your people, bring an idea to life, and make the kind of memories that stay after the lights come up.</p>
          <div className="story-ticket">
            <div className="ticket-stamp">
              GOOD
              <br />
              THINGS
              <br />
              HAPPEN
            </div>
            <div>
              <strong>Your next story starts here.</strong>
              <span>Discover · Gather · Belong</span>
            </div>
          </div>
        </div>
        <div className="auth-foot">Made for the moments that bring us closer · Kazakhstan</div>
      </section>
      <section className="auth-panel">
        <div className="auth-box">
          <p className="eyebrow">Welcome to BiletFlow</p>
          <h2>{registering ? "Create your account" : "Good to see you"}</h2>
          <p className="auth-subtitle">
            {registering
              ? "Start discovering events and bringing people together."
              : "Sign in to pick up right where your plans left off."}
          </p>
          <div className="auth-tabs" role="tablist" aria-label="Account access">
            <button
              className={`auth-tab ${!registering ? "active" : ""}`}
              type="button"
              role="tab"
              aria-selected={!registering}
              onClick={() => switchMode("login")}
            >
              Sign in
            </button>
            <button
              className={`auth-tab ${registering ? "active" : ""}`}
              type="button"
              role="tab"
              aria-selected={registering}
              onClick={() => switchMode("register")}
            >
              Create account
            </button>
          </div>
          <form id="auth-form" noValidate onSubmit={(event) => void handleSubmit(event)}>
            {registering ? (
              <div className="field">
                <label htmlFor="display-name">Your name</label>
                <input id="display-name" name="display_name" autoComplete="name" placeholder="e.g. Aida Sarsen" required maxLength={100} />
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="email">Email address</label>
              <input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={254} />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={registering ? "new-password" : "current-password"}
                placeholder={registering ? "At least 12 characters" : "Enter your password"}
                required
                maxLength={128}
                minLength={registering ? 12 : 1}
              />
            </div>
            {registering ? (
              <p className="field-note">Use at least 12 characters. We’ll email you a verification link.</p>
            ) : (
              <div className="auth-row">
                <span />
                <button
                  className="text-button"
                  type="button"
                  onClick={(event) => void handleForgot(event.currentTarget.form)}
                >
                  Forgot password?
                </button>
              </div>
            )}
            <button className="primary-button full" type="submit" disabled={busy}>
              {busy ? (registering ? "Creating account…" : "Signing in…") : registering ? "Create account" : "Sign in"}
              <span aria-hidden="true">→</span>
            </button>
            <p className={`auth-message ${feedback.success ? "success" : ""}`} role="status">
              {feedback.text}
            </p>
            {unverifiedEmail ? (
              <p className="resend-row">
                <button className="text-button" type="button" onClick={() => void handleResend()}>
                  Resend the verification email
                </button>
              </p>
            ) : null}
          </form>
          {!registering ? (
            <button className="google-button" type="button" disabled={busy} onClick={() => void handleGoogle()}>
              <span className="google-mark" aria-hidden="true">
                G
              </span>
              Continue with Google
            </button>
          ) : null}
          <div className="divider">OR</div>
          <button className="subtle-button full" type="button" onClick={() => navigate("/discover")}>
            Browse events without signing in
          </button>
          <p className="auth-legal">By continuing, you agree to our Terms of Service and Privacy Policy.</p>
        </div>
      </section>
    </main>
  );
}
