import { t, useLocale } from "../../../i18n";
import { useState } from "react";
import * as authApi from "../../../api/auth";
import { describeError } from "../../../api/errors";
import { session, sessionIdFromToken } from "../../../api/session";
import type { SessionView } from "../../../api/types";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/Feedback";
import { ListRow } from "../../../components/ui/ListRow";
import { StatusPill } from "../../../components/ui/StatusPill";
import { useToast } from "../../../components/ui/Toast";
import { dateLabel } from "../../../utils/format";

interface SessionListProps {
  sessions: SessionView[];
  onChanged: () => void;
}

export function SessionList({ sessions, onChanged }: SessionListProps) {
  useLocale();
  const { notify } = useToast();
  const [revoking, setRevoking] = useState("");
  const currentId = sessionIdFromToken(session.token);
  const now = Date.now();

  if (sessions.length === 0) return <EmptyState>{t("account.no_sessions")}</EmptyState>;

  const revoke = async (id: string) => {
    setRevoking(id);
    try {
      await authApi.revokeSession(id);
      notify(t("account.session_revoked"));
      onChanged();
    } catch (failure) {
      notify(describeError(failure));
    } finally {
      setRevoking("");
    }
  };

  return (
    <div className="list">
      {sessions.map((item) => {
        const current = item.id === currentId;
        const revoked = Boolean(item.revoked_at);
        const expired = new Date(item.expires_at).getTime() <= now;
        const active = !revoked && !expired;
        const label = current ? t("account.this_device") : item.client_kind === "web" ? t("account.web_browser") : t("account.scanner");
        const lifecycle = revoked
          ? t("account.revoked_at", { p0: dateLabel(item.revoked_at) })
          : expired
            ? t("account.expired_at", { p0: dateLabel(item.expires_at) })
            : t("account.expires_at", { p0: dateLabel(item.expires_at) });
        return (
          <ListRow
            key={item.id}
            icon={item.client_kind === "web" ? "W" : "S"}
            title={
              <>
                {label}
                {current ? <StatusPill>{t("account.current")}</StatusPill> : null}
              </>
            }
            meta={t("account.session_meta", { p0: dateLabel(item.created_at), p1: item.last_seen_at ? dateLabel(item.last_seen_at) : t("account.not_yet") })}
            note={lifecycle}
            actions={
              active && !current ? (
                <Button variant="danger" size="sm" disabled={revoking === item.id} onClick={() => void revoke(item.id)}>{t("organizer.revoke")}</Button>
              ) : null
            }
          />
        );
      })}
    </div>
  );
}
