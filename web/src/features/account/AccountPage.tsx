import * as authApi from "../../api/auth";
import { describeError } from "../../api/errors";
import { Button, ErrorPanel, Loading, PageHeading, Panel, PanelHeading, useToast } from "../../components/ui";
import { useRequest } from "../../hooks/useRequest";
import { useAuth } from "../auth/AuthContext";
import { ProfileForm } from "./components/ProfileForm";
import { SessionList } from "./components/SessionList";

export function AccountPage() {
  const { profile, setProfile, signOut, signOutEverywhere } = useAuth();
  const { notify } = useToast();
  const sessions = useRequest(() => authApi.listSessions(), []);

  if (!profile) return <Loading />;

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
      <PageHeading
        eyebrow="Your account"
        title="Profile & sessions."
        subtitle="Review your profile and keep track of where you’re signed in."
        actions={
          <>
            <Button onClick={() => void signOut()}>Sign out</Button>
            <Button variant="danger" onClick={() => void handleSignOutEverywhere()}>
              Sign out everywhere
            </Button>
          </>
        }
      />
      <div className="content-grid account-grid">
        <ProfileForm profile={profile} onSaved={setProfile} />
        <Panel>
          <PanelHeading
            title="Signed-in sessions"
            subtitle="Revoke a device you no longer use."
            trailing={
              <Button variant="text" onClick={sessions.reload}>
                Refresh
              </Button>
            }
          />
          {sessions.loading ? <Loading label="Loading sessions…" /> : null}
          {sessions.error ? <ErrorPanel title="We couldn’t load sessions." message={sessions.error} onRetry={sessions.reload} /> : null}
          {sessions.data ? <SessionList sessions={sessions.data} onChanged={sessions.reload} /> : null}
        </Panel>
      </div>
    </>
  );
}
