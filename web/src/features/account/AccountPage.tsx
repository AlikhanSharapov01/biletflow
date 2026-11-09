import { t, useLocale } from "../../i18n";
import { confirmAction } from "../../components/ui/ActionDialog";
import * as authApi from "../../api/auth";
import { describeError } from "../../api/errors";
import { Button, ErrorPanel, Loading, PageHeading, Panel, PanelHeading, useToast } from "../../components/ui";
import { useRequest } from "../../hooks/useRequest";
import { useAuth } from "../auth/AuthContext";
import { ProfileForm } from "./components/ProfileForm";
import { SessionList } from "./components/SessionList";

export function AccountPage() {
  useLocale();
  const { profile, setProfile, signOut, signOutEverywhere } = useAuth();
  const { notify } = useToast();
  const sessions = useRequest(() => authApi.listSessions(), []);

  if (!profile) return <Loading />;

  const handleSignOutEverywhere = async () => {
    if (!await confirmAction(t("auth.sign_out_confirm"))) return;
    try {
      await signOutEverywhere();
    } catch (failure) {
      notify(t("account.sign_out_error", { p0: describeError(failure) }));
    }
  };

  return (
    <>
      <PageHeading
        eyebrow={t("account.your_account")}
        title={t("account.profile_sessions")}
        subtitle={t("account.review")}
        actions={
          <>
            <Button onClick={() => void signOut()}>{t("auth.sign_out")}</Button>
            <Button variant="danger" onClick={() => void handleSignOutEverywhere()}>{t("auth.sign_out_everywhere")}</Button>
          </>
        }
      />
      <div className="content-grid account-grid">
        <ProfileForm profile={profile} onSaved={setProfile} />
        <Panel>
          <PanelHeading
            title={t("account.sessions")}
            subtitle={t("account.revoke_device")}
            trailing={
              <Button variant="text" onClick={sessions.reload}>{t("common.refresh")}</Button>
            }
          />
          {sessions.loading ? <Loading label={t("account.loading_sessions")} /> : null}
          {sessions.error ? <ErrorPanel title={t("account.sessions_error")} message={sessions.error} onRetry={sessions.reload} /> : null}
          {sessions.data ? <SessionList sessions={sessions.data} onChanged={sessions.reload} /> : null}
        </Panel>
      </div>
    </>
  );
}
