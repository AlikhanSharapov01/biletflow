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
import { t, useLocale } from "@/i18n";

// Suspension closes sales and admission; it never cancels, refunds or voids
// tickets — those stay explicit business actions.
export function AdminEventsPage() {
  useLocale();
  const router = useRouter();
  const { notify } = useToast();
  const events = useAdminSearch(searchEvents);
  const [pending, setPending] = useState<ModerationRequest | null>(null);

  function ask(event: AdminEventRow) {
    const suspended = event.moderation_state === "suspended";
    setPending({
      title: suspended ? t("admin.reinstate_event") : t("admin.suspend_event"),
      message: suspended ? t("admin.reason_reinstate") : t("admin.reason_suspend_event"),
      confirmLabel: suspended ? t("admin.reinstate_event") : t("admin.suspend_event"),
      run: async (reason) => {
        await moderateEvent(event.id, suspended ? "reinstate" : "suspend", reason);
        notify(suspended ? t("admin.event_reinstated") : t("admin.event_suspended"));
        events.reload();
      },
    });
  }

  return (
    <Panel>
      <PanelHeading title={t("common.events")} />
      <SectionNote text={t("admin.event_search_hint")} />
      <AdminSearchForm
        placeholder={t("admin.event_search_placeholder")}
        statusLabel={t("admin.moderation")}
        statuses={[
          { value: "normal", label: t("admin.normal") },
          { value: "suspended", label: t("org.suspended") },
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
                      {suspended ? <StatusPill label={t("org.suspended")} tone="blocked" /> : null}
                    </RowTitle>
                  }
                  meta={t("admin.capacity_meta", { p0: dateLabel(event.starts_at), p1: event.visibility, p2: event.capacity })}
                  note={t("admin.event_org", { p0: event.id, p1: event.organization_id })}
                  trailing={
                    <SubtleButton label={suspended ? t("admin.reinstate") : t("admin.suspend")} danger={!suspended} onPress={() => ask(event)} />
                  }
                >
                  <TextButton
                    label={t("mobile.admin.open_event_page")}
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
