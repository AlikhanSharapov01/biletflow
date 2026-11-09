import { t, useLocale } from "../../../i18n";
import { useState } from "react";
import { listModerationActions } from "../../../api/admin";
import { Button, EmptyState, ErrorPanel, Loading, Panel, PanelHeading } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { dateLabel, statusLabel } from "../../../utils/format";

const LIMIT = 50;

// Append-only record of every suspend / reinstate decision, newest first.
export function AdminModerationPage() {
  useLocale();
  const [offset, setOffset] = useState(0);
  const log = useRequest(() => listModerationActions(LIMIT, offset), [offset]);

  return (
    <Panel>
      <PanelHeading title={t("admin.moderation_log")} subtitle={t("admin.moderation_hint")} />
      {log.loading ? <Loading label={t("admin.loading_moderation")} /> : null}
      {log.error ? <ErrorPanel title={t("admin.moderation_error")} message={log.error} onRetry={log.reload} /> : null}
      {log.data && !log.loading ? (
        log.data.length === 0 ? (
          <EmptyState>{t("admin.no_moderation")}</EmptyState>
        ) : (
          <ol className="timeline">
            {log.data.map((entry) => (
              <li key={entry.id}>
                <time dateTime={entry.created_at}>{dateLabel(entry.created_at)}</time>
                <div>
                  <strong>{statusLabel(entry.action)}</strong>
                  <span>{entry.reason}</span>
                  <small>
                    {entry.target_user_id ? t("admin.user_id", { p0: entry.target_user_id }) : t("admin.event_id", { p0: entry.target_event_id ?? "unknown" })}{" "}{t("admin.by_admin_suffix")}{" "}{entry.actor_user_id.slice(0, 8)}
                  </small>
                </div>
              </li>
            ))}
          </ol>
        )
      ) : null}
      <nav className="pagination" aria-label={t("admin.moderation_pages")}>
        <Button size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>{t("support.newer")}{" "}</Button>
        <Button size="sm" disabled={(log.data?.length ?? 0) < LIMIT} onClick={() => setOffset(offset + LIMIT)}>{t("support.older")}{" "}</Button>
      </nav>
    </Panel>
  );
}
