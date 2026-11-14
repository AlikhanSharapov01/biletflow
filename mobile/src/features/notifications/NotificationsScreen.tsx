import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { describeError } from "@/api/errors";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "@/api/notifications";
import type { AppNotification } from "@/api/types/notifications";
import { ScrollScreen } from "@/components/layout";
import { EmptyState, ErrorPanel, LoadingState, PageHeading, Panel, SegmentedTabs, SubtleButton } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { useRequest } from "@/hooks/useRequest";

import { NotificationRow } from "./components/NotificationRow";
import { announceNotificationsChanged, notificationHref } from "./notificationTarget";
import { pluralForm, t, useLocale } from "@/i18n";

const MARKED = {
  one: "notifications.marked_one",
  few: "mobile.notifications.marked_few",
  many: "notifications.marked_many",
  other: "notifications.marked_many",
} as const;

const PAGE_SIZE = 50;
type Filter = "all" | "unread";
const FILTERS = [
  { id: "all" as const, get label() { return t("common.all"); } },
  { id: "unread" as const, get label() { return t("notifications.unread"); } },
];

export function NotificationsScreen() {
  useLocale();
  const router = useRouter();
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
    const href = notificationHref(notification);
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
    if (href) {
      // Coming back shows the item as read.
      inbox.reload();
      router.push(href);
    } else inbox.reload();
  };

  const markAll = async () => {
    try {
      const updated = await markAllNotificationsRead();
      announceNotificationsChanged();
      notify(updated ? t(MARKED[pluralForm(updated)], { count: updated }) : t("notifications.already_read"));
      inbox.reload();
    } catch (failure) {
      notify(describeError(failure));
    }
  };

  return (
    <ScrollScreen onRefresh={inbox.reload}>
      <PageHeading
        eyebrow={t("notifications.eyebrow")}
        title={t("notifications.title")}
        subtitle={t("notifications.subtitle")}
        actions={<SubtleButton label={t("notifications.mark_all")} onPress={() => void markAll()} disabled={!hasUnread} />}
      />
      <SegmentedTabs
        items={FILTERS}
        value={filter}
        fill
        onChange={(next) => {
          setFilter(next);
          setOffset(0);
        }}
      />
      <Panel>
        {inbox.loading ? <LoadingState message={t("notifications.loading")} /> : null}
        {inbox.error ? <ErrorPanel title={t("notifications.load_error")} message={inbox.error} onRetry={inbox.reload} /> : null}
        {!inbox.loading && !inbox.error && inbox.data ? (
          items.length === 0 ? (
            <EmptyState message={filter === "unread" ? t("notifications.caught_up") : t("notifications.empty")} />
          ) : (
            items.map((item) => (
              <NotificationRow key={item.id} notification={item} busy={busyId === item.id} onOpen={(next) => void open(next)} />
            ))
          )
        ) : null}
        {offset > 0 || items.length === PAGE_SIZE ? (
          <View style={styles.pager}>
            <SubtleButton label={t("support.newer")} disabled={offset === 0} onPress={() => setOffset(Math.max(0, offset - PAGE_SIZE))} />
            <SubtleButton label={t("support.older")} disabled={items.length < PAGE_SIZE} onPress={() => setOffset(offset + PAGE_SIZE)} />
          </View>
        ) : null}
      </Panel>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  pager: { flexDirection: "row", justifyContent: "space-between", marginTop: 12 },
});
