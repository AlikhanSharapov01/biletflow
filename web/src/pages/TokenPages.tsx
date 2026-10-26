import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import * as authApi from "../api/auth";
import { acceptInvitation } from "../api/catalog";
import { describeError } from "../api/errors";
import { useAuth } from "../auth/AuthContext";
import { consumeHashToken } from "../utils/format";

// Pages reached from emailed links. The backend puts the token in the URL
// fragment (`#token=…`); each page reads it once and submits it on a click, so
// a reload or React StrictMode never spends a single-use token twice.

function TokenLayout({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <main className="token-screen">
      <div className="auth-box">
        <Link className="brand" to="/discover" aria-label="BiletFlow home">
          <span className="brand-mark">b</span>BiletFlow
        </Link>
        <p className="eyebrow token-eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {children}
      </div>
    </main>
  );
}

function useHashToken(): string {
  const [token] = useState(() => consumeHashToken());
  return token;
}

function MissingToken({ action }: { action: string }) {
  return (
    <>
      <p className="auth-subtitle">This link is missing its token, so it cannot {action}. Open the link from your email again.</p>
      <Link className="primary-button" to="/sign-in">
        Go to sign in
      </Link>
    </>
  );
}

export function VerifyEmailPage() {
  const token = useHashToken();
  const { status, setProfile } = useAuth();
  const [state, setState] = useState<{ busy: boolean; done: boolean; message: string }>({ busy: false, done: false, message: "" });

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
            <Link className="primary-button" to="/sign-in">
              Continue to sign in
            </Link>
          ) : (
            <button className="primary-button" type="button" disabled={state.busy} onClick={() => void verify()}>
              {state.busy ? "Verifying…" : "Verify email"}
            </button>
          )}
          <p className={`auth-message ${state.done ? "success" : ""}`} role="status">
            {state.message}
          </p>
        </>
      )}
    </TokenLayout>
  );
}

export function ResetPasswordPage() {
  const token = useHashToken();
  const [state, setState] = useState<{ busy: boolean; done: boolean; message: string }>({ busy: false, done: false, message: "" });

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
          <Link className="primary-button" to="/sign-in">
            Sign in with the new password
          </Link>
        </>
      ) : (
        <form noValidate onSubmit={(event) => void submit(event)}>
          <div className="field">
            <label htmlFor="new-password">New password</label>
            <input id="new-password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} placeholder="At least 12 characters" />
          </div>
          <div className="field">
            <label htmlFor="confirm-password">Repeat password</label>
            <input id="confirm-password" name="confirmation" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
          </div>
          <button className="primary-button full" type="submit" disabled={state.busy}>
            {state.busy ? "Saving…" : "Set new password"}
          </button>
          <p className="auth-message" role="status">
            {state.message}
          </p>
        </form>
      )}
    </TokenLayout>
  );
}

export function AcceptInvitationPage() {
  const token = useHashToken();
  const { profile } = useAuth();
  const [state, setState] = useState<{ busy: boolean; done: boolean; message: string }>({ busy: false, done: false, message: "" });

  const accept = async () => {
    setState({ busy: true, done: false, message: "" });
    try {
      await acceptInvitation(token);
      setState({ busy: false, done: true, message: "You joined the workspace. The owner can now assign you to events." });
    } catch (failure) {
      setState({ busy: false, done: false, message: describeError(failure) });
    }
  };

  return (
    <TokenLayout eyebrow="Organizer invitation" title="Join a workspace">
      {!token ? (
        <MissingToken action="accept the invitation" />
      ) : (
        <>
          <p className="auth-subtitle">
            You are signed in as <strong>{profile?.email}</strong>. The invitation must have been sent to this exact address.
          </p>
          {state.done ? (
            <Link className="primary-button" to="/organizer">
              Open the organizer workspace
            </Link>
          ) : (
            <button className="primary-button" type="button" disabled={state.busy} onClick={() => void accept()}>
              {state.busy ? "Joining…" : "Accept invitation"}
            </button>
          )}
          <p className={`auth-message ${state.done ? "success" : ""}`} role="status">
            {state.message}
          </p>
        </>
      )}
    </TokenLayout>
  );
}
