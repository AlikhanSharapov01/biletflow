import { useParams, useSearchParams } from "react-router";
import { getEvent, listCategories, listTicketTypes, listVenues } from "../../api/catalog";
import { ErrorPanel, Loading, PageHeading, Panel, PanelHeading, StatusPill } from "../../components/ui";
import { useRequest } from "../../hooks/useRequest";
import { dateLabel } from "../../utils/format";
import { publicationTone } from "../../utils/status";
import { useAuth } from "../auth/AuthContext";
import { CheckoutPanel } from "../checkout/CheckoutPanel";
import { SupportLink } from "../support/components/SupportLink";
import { CalendarLinks } from "./components/CalendarLinks";
import { EventFacts } from "./components/EventFacts";
import { ReportEventForm } from "./components/ReportEventForm";

export function EventPage() {
  const { eventId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const { status } = useAuth();

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

  if (page.loading) return <Loading label="Loading event details…" />;
  if (page.error || !page.data) {
    return <ErrorPanel title="We couldn’t load this event." message={page.error ?? "Unknown error"} onRetry={page.reload} />;
  }

  const { event, tickets, category, venue } = page.data;

  return (
    <>
      <PageHeading
        back={{ to: "/discover", label: "Back to events" }}
        eyebrow={category?.name_en ?? "Event"}
        title={event.title}
        subtitle={`${dateLabel(event.starts_at)} – ${dateLabel(event.ends_at)}${venue ? ` · ${venue.name} · ${venue.city}` : ""}`}
        actions={<StatusPill tone={publicationTone(event.publication_state)}>{{ draft: "Draft", published: "Published", unpublished: "Unpublished", cancelled: "Cancelled" }[event.publication_state]}</StatusPill>}
      />
      <div className="content-grid">
        <Panel>
          <PanelHeading title="About this event" />
          <p className="event-description">{event.description || "More details will be shared by the organizer."}</p>
          <div className="checkout-heading">
            <PanelHeading title="Tickets" />
          </div>
          <CheckoutPanel event={event} tickets={tickets} promoFromUrl={searchParams.get("promo")} />
        </Panel>
        <Panel as="aside">
          <PanelHeading title="Details" />
          <EventFacts event={event} venue={venue} />
          <CalendarLinks key={status} eventId={event.id} />
          {status === "authenticated" ? <ReportEventForm eventId={event.id} /> : null}
          {status === "authenticated" ? <SupportLink eventId={event.id} /> : null}
        </Panel>
      </div>
    </>
  );
}
