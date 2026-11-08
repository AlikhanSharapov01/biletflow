import { useEffect, useState } from "react";

import { listSessions } from "@/api/account";
import { getTokens } from "@/api/tokenStorage";
import { ScrollScreen } from "@/components/layout";
import { ErrorPanel, LoadingState, PageHeading, Panel, PanelHeading, TextButton } from "@/components/ui";
import { SessionList } from "@/features/account/components/SessionList";
import { sessionIdFromToken } from "@/features/account/utils/sessionId";
import { useRequest } from "@/hooks/useRequest";

// Signed-in sessions of this account; "This device" comes from the `sid`
// claim of the stored access token.
export function SessionsScreen() {
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
        eyebrow="Your account"
        title="Signed-in sessions"
        subtitle="Revoke a device you no longer use."
      />
      <Panel>
        <PanelHeading title="Sessions" trailing={<TextButton label="Refresh" onPress={sessions.reload} />} />
        {sessions.loading && !sessions.data ? <LoadingState message="Loading sessions…" /> : null}
        {sessions.error ? (
          <ErrorPanel title="We couldn’t load sessions." message={sessions.error} onRetry={sessions.reload} />
        ) : null}
        {sessions.data ? (
          <SessionList sessions={sessions.data} currentId={currentId} onChanged={sessions.reload} />
        ) : null}
      </Panel>
    </ScrollScreen>
  );
}
