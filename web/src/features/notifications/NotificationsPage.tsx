import { t, useLocale } from "../../i18n";
import { useState } from "react";
import { useNavigate } from "react-router";
import { describeError } from "../../api/errors";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../../api/notifications";
import type { AppNotification } from "../../api/types/notifications";
import { Button, EmptyState, ErrorPanel, Loading, PageHeading, Panel, TabPanel, Tabs, useToast } from "../../components/ui";
import { useRequest } from "../../hooks/useRequest";
import { NotificationRow } from "./components/NotificationRow";
import { announceNotificationsChanged, notificationPath } from "./notificationTarget";

const PAGE_SIZE = 50;
type Filter = "all" | "unread";
const FILTERS = [
  { id: "all" as const, get label() { return t("common.all"); } },
  { id: "unread" as const, get label() { return t("notifications.unread"); } },
];

export function NotificationsPage() {
  useLocale();
  const navigate = useNavigate();
  const { notify } = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [offset, setOffset] = useState(0);
  const [busyId, setBusyId] = useState("");
  const inbox = useRequest(
    () => listNotifications({ unread_only: filter === "unread", limit: PAGE_SIZE, offset }),
    [filter, offset],
  );
  const items = inbox.data ?? [];
  const hasUnread = items.some((item) => !item.read_at);

  const open = async (notification: AppNotification) => {
    const path = notificationPath(notification);
    if (!notification.read_at) {
      setBusyId(notification.id);
      try {
        await markNotificationRead(notification.id);
        announceNotificationsChanged();
      } catch (failure) {
        notify(describeError(failure));
      } finally {
        setBusyId("");
      }
    }
    if (path) navigate(path);
    else inbox.reload();
  };

  const markAll = async () => {
    try {
      const updated = await markAllNotificationsRead();
      announceNotificationsChanged();
      notify(updated ? t(updated === 1 ? "notifications.marked_one" : "notifications.marked_many", { count: updated }) : t("notifications.already_read"));
      inbox.reload();
    } catch (failure) {
      notify(describeError(failure));
    }
  };

  const changeFilter = (next: Filter) => {
    setFilter(next);
    setOffset(0);
  };

  return (
    <>
      <PageHeading
        eyebrow={t("notifications.eyebrow")}
        title={t("notifications.title")}
        subtitle={t("notifications.subtitle")}
        actions={
          <Button onClick={() => void markAll()} disabled={!hasUnread}>{t("notifications.mark_all")}{" "}</Button>
        }
      />
      <Tabs label={t("notifications.filter")} idPrefix="notifications" items={FILTERS} value={filter} onChange={changeFilter} />
      <TabPanel idPrefix="notifications" active={filter}>
        <Panel>
          {inbox.loading ? <Loading label={t("notifications.loading")} /> : null}
          {inbox.error ? <ErrorPanel title={t("notifications.load_error")} message={inbox.error} onRetry={inbox.reload} /> : null}
          {!inbox.loading && inbox.data ? (
            items.length === 0 ? (
              <EmptyState>{filter === "unread" ? t("notifications.caught_up") : t("notifications.empty")}</EmptyState>
            ) : (
              <ul className="notification-list">
                {items.map((item) => (
                  <NotificationRow key={item.id} notification={item} busy={busyId === item.id} onOpen={(next) => void open(next)} />
                ))}
              </ul>
            )
          ) : null}
          {offset > 0 || items.length === PAGE_SIZE ? (
            <div className="form-actions">
              <Button size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>{t("support.newer")}{" "}</Button>
              <Button size="sm" disabled={items.length < PAGE_SIZE} onClick={() => setOffset(offset + PAGE_SIZE)}>{t("support.older")}{" "}</Button>
            </div>
          ) : null}
        </Panel>
      </TabPanel>
    </>
  );
}
