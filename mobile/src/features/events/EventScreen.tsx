import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { getEvent, listCategories, listTicketTypes, listVenues } from "@/api/catalog";
import { ScrollScreen } from "@/components/layout";
import { ErrorPanel, LoadingState, PageHeading, Panel, PanelHeading, StatusPill, SubtleButton } from "@/components/ui";
import { CheckoutPanel } from "@/features/checkout/CheckoutPanel";
import { useRequest } from "@/hooks/useRequest";
import { colors, fonts } from "@/theme";
import { dateLabel } from "@/utils/format";
import { publicationTone } from "@/utils/status";
import { CalendarLinks } from "./components/CalendarLinks";
import { EventFacts } from "./components/EventFacts";
import { ReportEventForm } from "./components/ReportEventForm";

// /events/[eventId] — details, venue, tickets and checkout. A `promo` param
// (from a campaign link) pre-fills the promo code.
export function EventScreen() {
  const { eventId = "", promo } = useLocalSearchParams<{ eventId: string; promo?: string }>();
  const router = useRouter();

  const page = useRequest(
    async () => {
      const [event, tickets, categories, venues] = await Promise.all([
        getEvent(eventId),
        listTicketTypes(eventId),
        listCategories(),
        listVenues(),
      ]);
      return {
        event,
        tickets: tickets.filter((ticket) => !ticket.is_hidden),
        category: categories.find((item) => item.id === event.category_id) ?? null,
        venue: venues.find((item) => item.id === event.venue_id) ?? null,
      };
    },
    [eventId],
  );

  if (!page.data) {
    return (
      <ScrollScreen backLabel="Back to events">
        {page.loading ? (
          <LoadingState message="Loading event details…" />
        ) : (
          <ErrorPanel title="We couldn’t load this event." message={page.error ?? "Unknown error"} onRetry={page.reload} />
        )}
      </ScrollScreen>
    );
  }

  const { event, tickets, category, venue } = page.data;

  return (
    <ScrollScreen backLabel="Back to events" refreshing={page.loading} onRefresh={page.reload}>
      <PageHeading
        eyebrow={category?.name_en ?? "Event"}
        title={event.title}
        subtitle={`${dateLabel(event.starts_at)} – ${dateLabel(event.ends_at)}${venue ? ` · ${venue.name} · ${venue.city}` : ""}`}
        actions={<StatusPill tone={publicationTone(event.publication_state)} label={event.publication_state} />}
      />
      <Panel>
        <PanelHeading title="About this event" />
        <Text style={styles.description}>{event.description || "More details will be shared by the organizer."}</Text>
        <View style={styles.tickets}>
          <PanelHeading title="Tickets" />
          <CheckoutPanel event={event} tickets={tickets} promoFromRoute={typeof promo === "string" ? promo : null} />
        </View>
      </Panel>
      <Panel>
        <PanelHeading title="Details" />
        <EventFacts event={event} venue={venue} />
        <CalendarLinks eventId={event.id} />
        <ReportEventForm eventId={event.id} />
        <SubtleButton
          label="Get help"
          style={styles.help}
          onPress={() => router.push({ pathname: "/support/new", params: { event_id: event.id } })}
        />
      </Panel>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  description: { color: colors.ink, fontFamily: fonts.sans, fontSize: 15, lineHeight: 23 },
  tickets: { marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.lineSoft },
  help: { alignSelf: "flex-start", marginTop: 16 },
});
