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

const PAGE_SIZE = 50;
type Filter = "all" | "unread";
const FILTERS = [
  { id: "all" as const, label: "All" },
  { id: "unread" as const, label: "Unread" },
];

export function NotificationsScreen() {
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
      notify(updated ? `Marked ${updated} notification${updated === 1 ? "" : "s"} as read.` : "Everything was already read.");
      inbox.reload();
    } catch (failure) {
      notify(describeError(failure));
    }
  };

  return (
    <ScrollScreen onRefresh={inbox.reload}>
      <PageHeading
        eyebrow="Stay in the loop"
        title="Notifications."
        subtitle="Updates about your tickets, orders, events and support cases."
        actions={<SubtleButton label="Mark all read" onPress={() => void markAll()} disabled={!hasUnread} />}
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
        {inbox.loading ? <LoadingState message="Loading notifications…" /> : null}
        {inbox.error ? <ErrorPanel title="We couldn’t load your notifications." message={inbox.error} onRetry={inbox.reload} /> : null}
        {!inbox.loading && !inbox.error && inbox.data ? (
          items.length === 0 ? (
            <EmptyState message={filter === "unread" ? "You’re all caught up." : "No notifications yet."} />
          ) : (
            items.map((item) => (
              <NotificationRow key={item.id} notification={item} busy={busyId === item.id} onOpen={(next) => void open(next)} />
            ))
          )
        ) : null}
        {offset > 0 || items.length === PAGE_SIZE ? (
          <View style={styles.pager}>
            <SubtleButton label="Newer" disabled={offset === 0} onPress={() => setOffset(Math.max(0, offset - PAGE_SIZE))} />
            <SubtleButton label="Older" disabled={items.length < PAGE_SIZE} onPress={() => setOffset(offset + PAGE_SIZE)} />
          </View>
        ) : null}
      </Panel>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  pager: { flexDirection: "row", justifyContent: "space-between", marginTop: 12 },
});
