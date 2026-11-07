import { useState } from "react";
import { useNavigate } from "react-router";
import { duplicateEvent, listOrganizationEvents, publishEvent, unpublishEvent } from "../../../api/eventAdmin";
import { describeError } from "../../../api/errors";
import type { EventView, Organization, Venue } from "../../../api/types";
import { EmptyState, ErrorPanel, Loading, Panel, PanelHeading, StatusPill, TabPanel, Tabs, useToast } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { EVENT_GROUPS, defaultGroup, groupEvents, type EventGroup } from "../utils/eventGroups";
import { WorkspaceEventCard } from "./WorkspaceEventCard";

interface EventsPanelProps {
  organization: Organization;
  venues: Venue[];
}

// The workspace's events, grouped into Active / Upcoming / Completed /
// Cancelled from the server's time status and publication state.
export function EventsPanel({ organization, venues }: EventsPanelProps) {
  const { notify } = useToast();
  const navigate = useNavigate();
  const events = useRequest(() => listOrganizationEvents(organization.id), [organization.id]);
  const [pendingId, setPendingId] = useState("");
  const [chosen, setChosen] = useState<EventGroup | null>(null);

  const run = async (event: EventView, action: () => Promise<unknown>, done: string) => {
    setPendingId(event.id);
    try {
      await action();
      notify(done);
      events.reload();
    } catch (failure) {
      notify(describeError(failure));
    } finally {
      setPendingId("");
    }
  };

  const duplicate = async (event: EventView) => {
    setPendingId(event.id);
    try {
      const copy = await duplicateEvent(event.id);
      notify("Draft copied. Adjust its dates before publishing.");
      navigate(`/organizer/events/${encodeURIComponent(copy.id)}`);
    } catch (failure) {
      notify(describeError(failure));
      setPendingId("");
    }
  };

  const groups = groupEvents(events.data ?? []);
  const group = chosen ?? defaultGroup(groups);
  const info = EVENT_GROUPS.find((item) => item.id === group) ?? EVENT_GROUPS[0];

  return (
    <Panel>
      <PanelHeading title="Your events" trailing={<StatusPill tone="neutral">{events.data?.length ?? 0} total</StatusPill>} />
      {events.loading ? <Loading label="Loading events…" /> : null}
      {events.error ? <ErrorPanel title="We couldn’t load your events." message={events.error} onRetry={events.reload} /> : null}
      {events.data ? (
        events.data.length === 0 ? (
          <EmptyState>No events in this workspace yet. Create a draft to get started.</EmptyState>
        ) : (
          <>
            <Tabs
              label="Event groups"
              items={EVENT_GROUPS.map((item) => ({ id: item.id, label: `${item.label} · ${groups[item.id].length}` }))}
              value={group}
              onChange={setChosen}
              idPrefix="event-group"
            />
            <TabPanel idPrefix="event-group" active={group}>
              {groups[group].length === 0 ? (
                <EmptyState>{info?.empty}</EmptyState>
              ) : (
                <div className="card-list">
                  {groups[group].map((event) => {
                    const published = event.publication_state === "published";
                    return (
                      <WorkspaceEventCard
                        key={event.id}
                        event={event}
                        venue={venues.find((item) => item.id === event.venue_id)}
                        busy={pendingId === event.id}
                        onTogglePublish={() =>
                          void run(event, () => (published ? unpublishEvent(event.id) : publishEvent(event.id)), published ? "Event unpublished." : "Event published.")
                        }
                        onDuplicate={() => void duplicate(event)}
                      />
                    );
                  })}
                </div>
              )}
            </TabPanel>
          </>
        )
      ) : null}
    </Panel>
  );
}
