import { useEffect, useState } from "react";

import { listSessions } from "@/api/account";
import { getTokens } from "@/api/tokenStorage";
import { ScrollScreen } from "@/components/layout";
import { ErrorPanel, LoadingState, PageHeading, Panel, PanelHeading, TextButton } from "@/components/ui";
import { SessionList } from "@/features/account/components/SessionList";
import { sessionIdFromToken } from "@/features/account/utils/sessionId";
import { useRequest } from "@/hooks/useRequest";
import { t, useLocale } from "@/i18n";

// Signed-in sessions of this account; "This device" comes from the `sid`
// claim of the stored access token.
export function SessionsScreen() {
  useLocale();
  const sessions = useRequest(() => listSessions(), []);
  const [currentId, setCurrentId] = useState("");

  useEffect(() => {
    let active = true;
    getTokens()
      .then(({ accessToken }) => {
        if (active) setCurrentId(sessionIdFromToken(accessToken));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [sessions.data]);

  return (
    <ScrollScreen refreshing={sessions.loading && Boolean(sessions.data)} onRefresh={sessions.reload}>
      <PageHeading
        eyebrow={t("account.your_account")}
        title={t("account.sessions")}
        subtitle={t("account.revoke_device")}
      />
      <Panel>
        <PanelHeading title={t("mobile.account.sessions")} trailing={<TextButton label={t("common.refresh")} onPress={sessions.reload} />} />
        {sessions.loading && !sessions.data ? <LoadingState message={t("account.loading_sessions")} /> : null}
        {sessions.error ? (
          <ErrorPanel title={t("account.sessions_error")} message={sessions.error} onRetry={sessions.reload} />
        ) : null}
        {sessions.data ? (
          <SessionList sessions={sessions.data} currentId={currentId} onChanged={sessions.reload} />
        ) : null}
      </Panel>
    </ScrollScreen>
  );
}
