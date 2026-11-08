import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { moderateEvent, searchEvents } from "@/api/admin";
import type { AdminEventRow } from "@/api/types/admin";
import { ListRow, Panel, PanelHeading, StatusPill, SubtleButton, TextButton } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { AdminSearchForm } from "@/features/admin/components/AdminSearchForm";
import { ModerationDialog, type ModerationRequest } from "@/features/admin/components/ModerationDialog";
import { RowTitle } from "@/features/admin/components/RowTitle";
import { SearchResults } from "@/features/admin/components/SearchResults";
import { SectionNote } from "@/features/admin/components/SectionNote";
import { useAdminSearch } from "@/features/admin/hooks/useAdminSearch";
import { dateLabel, statusLabel } from "@/utils/format";
import { publicationTone } from "@/utils/status";

// Suspension closes sales and admission; it never cancels, refunds or voids
// tickets — those stay explicit business actions.
export function AdminEventsPage() {
  const router = useRouter();
  const { notify } = useToast();
  const events = useAdminSearch(searchEvents);
  const [pending, setPending] = useState<ModerationRequest | null>(null);

  function ask(event: AdminEventRow) {
    const suspended = event.moderation_state === "suspended";
    setPending({
      title: suspended ? "Reinstate event" : "Suspend event",
      message: suspended ? "Reason for reinstating" : "Reason for suspending (closes sales and admission)",
      confirmLabel: suspended ? "Reinstate event" : "Suspend event",
      run: async (reason) => {
        await moderateEvent(event.id, suspended ? "reinstate" : "suspend", reason);
        notify(suspended ? "Event reinstated." : "Event suspended.");
        events.reload();
      },
    });
  }

  return (
    <Panel>
      <PanelHeading title="Events" />
      <SectionNote text="Search by title, event id or organization id." />
      <AdminSearchForm
        placeholder="Event title or id"
        statusLabel="Moderation"
        statuses={[
          { value: "normal", label: "Normal" },
          { value: "suspended", label: "Suspended" },
        ]}
        onApply={events.apply}
      />
      <SearchResults noun="events" {...events} onPage={events.setOffset}>
        {(items) => (
          <View>
            {items.map((event) => {
              const suspended = event.moderation_state === "suspended";
              return (
                <ListRow
                  key={event.id}
                  icon="E"
                  title={
                    <RowTitle text={event.title}>
                      <StatusPill label={statusLabel(event.publication_state)} tone={publicationTone(event.publication_state)} />
                      {suspended ? <StatusPill label="Suspended" tone="blocked" /> : null}
                    </RowTitle>
                  }
                  meta={`${dateLabel(event.starts_at)} · ${event.visibility} · capacity ${event.capacity}`}
                  note={`Event ${event.id} · organization ${event.organization_id}`}
                  trailing={
                    <SubtleButton label={suspended ? "Reinstate" : "Suspend"} danger={!suspended} onPress={() => ask(event)} />
                  }
                >
                  <TextButton
                    label="Open event page"
                    onPress={() => router.push({ pathname: "/events/[eventId]", params: { eventId: event.id } })}
                  />
                </ListRow>
              );
            })}
          </View>
        )}
      </SearchResults>
      <ModerationDialog request={pending} onClose={() => setPending(null)} />
    </Panel>
  );
}
