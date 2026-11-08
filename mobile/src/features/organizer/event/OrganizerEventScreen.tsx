import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";

import { getEvent, listCategories, listVenues } from "@/api/catalog";
import { cancelEvent, duplicateEvent, publishEvent, unpublishEvent } from "@/api/eventAdmin";
import { describeError } from "@/api/errors";
import { ScrollScreen } from "@/components/layout";
import { confirmAction, ErrorPanel, LoadingState, SegmentedTabs } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { useRequest } from "@/hooks/useRequest";

import { EventHeader } from "./EventHeader";
import { EVENT_TABS, type EventTab } from "./eventTabs";
import { TabContent } from "./TabContent";

// One event's management screen (web OrganizerEventPage): header actions and
// every section as a tab.
export function OrganizerEventScreen() {
  const { eventId = "" } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const { notify } = useToast();
  const [tab, setTab] = useState<EventTab>("details");
  const [busy, setBusy] = useState(false);

  const page = useRequest(async () => {
    const [event, categories, venues] = await Promise.all([getEvent(eventId), listCategories(), listVenues()]);
    return { event, categories, venues };
  }, [eventId]);

  if (!page.data) {
    return (
      <ScrollScreen backLabel="Organizer workspace">
        {page.loading ? <LoadingState message="Loading event…" /> : null}
        {page.error ? <ErrorPanel title="We couldn’t load this event." message={page.error} onRetry={page.reload} /> : null}
      </ScrollScreen>
    );
  }
  const { event, categories, venues } = page.data;
  const published = event.publication_state === "published";

  const act = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await action();
      notify(done);
      page.reload();
    } catch (failure) {
      notify(describeError(failure));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    const confirmed = await confirmAction({
      title: "Cancel this event?",
      message: "This cannot be undone.",
      confirmLabel: "Cancel event",
      cancelLabel: "Keep event",
      destructive: true,
    });
    if (confirmed) await act(() => cancelEvent(event.id), "Event cancelled.");
  };

  const duplicate = async () => {
    setBusy(true);
    try {
      const copy = await duplicateEvent(event.id);
      notify("Draft copied. Adjust its dates before publishing.");
      router.push({ pathname: "/organizer/events/[eventId]", params: { eventId: copy.id } });
    } catch (failure) {
      notify(describeError(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollScreen backLabel="Organizer workspace" onRefresh={page.reload} refreshing={page.loading}>
      <EventHeader
        event={event}
        venue={venues.find((item) => item.id === event.venue_id)}
        busy={busy}
        onOpenPublic={() => router.push({ pathname: "/events/[eventId]", params: { eventId: event.id } })}
        onTogglePublish={() =>
          void act(() => (published ? unpublishEvent(event.id) : publishEvent(event.id)), published ? "Event unpublished." : "Event published.")
        }
        onDuplicate={() => void duplicate()}
        onCancel={() => void cancel()}
      />
      <SegmentedTabs items={EVENT_TABS} value={tab} onChange={setTab} />
      <TabContent tab={tab} event={event} categories={categories} venues={venues} onSaved={page.reload} />
    </ScrollScreen>
  );
}
