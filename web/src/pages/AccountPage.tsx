import { useState, type FormEvent } from "react";
import * as authApi from "../api/auth";
import { describeError } from "../api/errors";
import { session, sessionIdFromToken } from "../api/session";
import type { Locale, SessionView } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { EmptyState, ErrorPanel, FormMessage, Loading } from "../components/Feedback";
import { useToast } from "../components/Toast";
import { useRequest } from "../hooks/useRequest";
import { dateLabel } from "../utils/format";

const LOCALES: Array<[Locale, string]> = [
  ["en", "English"],
  ["kk", "Қазақша"],
  ["ru", "Русский"],
];

export function AccountPage() {
  const { profile, setProfile, signOut, signOutEverywhere } = useAuth();
  const { notify } = useToast();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: "", success: false });
  const sessions = useRequest(() => authApi.listSessions(), []);

  if (!profile) return <Loading />;

  const handleProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setMessage({ text: "", success: false });
    try {
      const updated = await authApi.updateProfile({
        display_name: String(data.get("display_name") ?? "").trim(),
        locale: String(data.get("locale") ?? "en") as Locale,
      });
      setProfile(updated);
      notify("Profile updated.");
      setMessage({ text: "Saved.", success: true });
    } catch (failure) {
      setMessage({ text: describeError(failure), success: false });
    } finally {
      setSaving(false);
    }
  };

  const handleSignOutEverywhere = async () => {
    if (!window.confirm("Sign out of every active BiletFlow session? This device will also be signed out.")) return;
    try {
      await signOutEverywhere();
    } catch (failure) {
      notify(`Could not sign out everywhere: ${describeError(failure)}`);
    }
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Your account</p>
          <h1 className="serif">Profile & sessions.</h1>
          <p>Review your profile and keep track of where you’re signed in.</p>
        </div>
        <div className="heading-actions">
          <button className="subtle-button" type="button" onClick={() => void signOut()}>
            Sign out
          </button>
          <button className="subtle-button danger-button" type="button" onClick={() => void handleSignOutEverywhere()}>
            Sign out everywhere
          </button>
        </div>
      </div>
      <div className="content-grid account-grid">
        <section className="panel live-form-panel">
          <div className="panel-heading">
            <h2>Your profile</h2>
            <span className={`status ${profile.email_verified_at ? "" : "pending"}`}>
              {profile.email_verified_at ? "Email verified" : "Email not verified"}
            </span>
          </div>
          <p className="account-email">{profile.email}</p>
          <form className="live-form" onSubmit={(event) => void handleProfile(event)}>
            <label className="field">
              <span>Display name</span>
              <input name="display_name" required minLength={1} maxLength={100} defaultValue={profile.display_name} />
            </label>
            <label className="field">
              <span>Language</span>
              <select name="locale" defaultValue={profile.locale}>
                {LOCALES.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <FormMessage message={message.text} success={message.success} />
            <button className="primary-button" type="submit" disabled={saving}>
              Save profile
            </button>
          </form>
        </section>
        <section className="panel session-panel">
          <div className="panel-heading">
            <div>
              <h2>Signed-in sessions</h2>
              <p className="panel-subtitle">Revoke a device you no longer use.</p>
            </div>
            <button className="text-button" type="button" onClick={sessions.reload}>
              Refresh
            </button>
          </div>
          {sessions.loading ? <Loading label="Loading sessions…" /> : null}
          {sessions.error ? <ErrorPanel title="We couldn’t load sessions." message={sessions.error} onRetry={sessions.reload} /> : null}
          {sessions.data ? <SessionList sessions={sessions.data} onChanged={sessions.reload} /> : null}
        </section>
      </div>
    </>
  );
}

interface SessionListProps {
  sessions: SessionView[];
  onChanged: () => void;
}

function SessionList({ sessions, onChanged }: SessionListProps) {
  const { notify } = useToast();
  const [revoking, setRevoking] = useState("");
  const currentId = sessionIdFromToken(session.token);
  const now = Date.now();

  if (sessions.length === 0) return <EmptyState>No sessions were found for this account.</EmptyState>;

  const revoke = async (id: string) => {
    setRevoking(id);
    try {
      await authApi.revokeSession(id);
      notify("Session revoked.");
      onChanged();
    } catch (failure) {
      notify(describeError(failure));
    } finally {
      setRevoking("");
    }
  };

  return (
    <div className="session-list">
      {sessions.map((item) => {
        const current = item.id === currentId;
        const revoked = Boolean(item.revoked_at);
        const expired = new Date(item.expires_at).getTime() <= now;
        const active = !revoked && !expired;
        const label = current ? "This device" : item.client_kind === "web" ? "Web browser" : "Scanner";
        const lifecycle = revoked
          ? `Revoked ${dateLabel(item.revoked_at)}`
          : expired
            ? `Expired ${dateLabel(item.expires_at)}`
            : `Expires ${dateLabel(item.expires_at)}`;
        return (
          <article className="session-row" key={item.id}>
            <div className="session-icon" aria-hidden="true">
              {item.client_kind === "web" ? "W" : "S"}
            </div>
            <div className="session-info">
              <strong>
                {label}
                {current ? <span className="status">Current</span> : null}
              </strong>
              <span>
                Started {dateLabel(item.created_at)} · Last active {item.last_seen_at ? dateLabel(item.last_seen_at) : "Not yet"}
              </span>
              <small>{lifecycle}</small>
            </div>
            {active && !current ? (
              <button
                className="subtle-button revoke-session"
                type="button"
                disabled={revoking === item.id}
                onClick={() => void revoke(item.id)}
              >
                Revoke
              </button>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
