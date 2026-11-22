import { useRef } from "react";
import { categoryName, t, useLocale } from "../../i18n";
import { useParams, useSearchParams } from "react-router";
import { getEvent, listCategories, listTicketTypes, listVenues } from "../../api/catalog";
import { ErrorPanel, EventImage, PageHeading, Panel, PanelHeading, SkeletonPage, StatusPill } from "../../components/ui";
import { useRequest } from "../../hooks/useRequest";
import { dateLabel } from "../../utils/format";
import { publicationTone } from "../../utils/status";
import { useAuth } from "../auth/AuthContext";
import { CheckoutPanel } from "../checkout/CheckoutPanel";
import { SupportLink } from "../support/components/SupportLink";
import { CalendarLinks } from "./components/CalendarLinks";
import { EventFacts } from "./components/EventFacts";
import { GetTicketsBar, TICKETS_HEADING_ID, TICKETS_SECTION_ID } from "./components/GetTicketsBar";
import { ReportEventForm } from "./components/ReportEventForm";

export function EventPage() {
  useLocale();
  const { eventId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const { status } = useAuth();
  const ticketsSection = useRef<HTMLElement>(null);

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

  if (page.loading) return <SkeletonPage label={t("event.loading")} />;
  if (page.error || !page.data) {
    return <ErrorPanel title={t("event.load_error")} message={page.error ?? t("errors.unknown")} onRetry={page.reload} />;
  }

  const { event, tickets, category, venue } = page.data;

  return (
    <>
      <PageHeading
        back={{ to: "/discover", label: t("event.back") }}
        eyebrow={categoryName(category ?? undefined)}
        title={event.title}
        subtitle={`${dateLabel(event.starts_at)} – ${dateLabel(event.ends_at)}${venue ? ` · ${venue.name} · ${venue.city}` : ""}`}
        actions={<StatusPill tone={publicationTone(event.publication_state)}>{{ draft: t("common.draft"), published: t("common.published"), unpublished: t("common.unpublished"), cancelled: t("common.cancelled") }[event.publication_state]}</StatusPill>}
      />
      {event.images.length > 0 ? (
        <div className="event-gallery">
          {event.images.map((image) => (
            <EventImage key={image.id} className={image.is_cover ? "event-hero" : "event-gallery-image"} src={image.url} alt={image.alt_text} />
          ))}
        </div>
      ) : null}
      <div className="content-grid">
        <Panel>
          <PanelHeading title={t("event.about")} />
          <p className="event-description">{event.description || t("event.more_details")}</p>
          <section className="checkout-section" id={TICKETS_SECTION_ID} ref={ticketsSection} aria-labelledby={TICKETS_HEADING_ID}>
            <div className="checkout-heading">
              <PanelHeading title={t("common.tickets")} headingId={TICKETS_HEADING_ID} focusable />
            </div>
            <CheckoutPanel key={event.id} event={event} tickets={tickets} promoFromUrl={searchParams.get("promo")} />
          </section>
        </Panel>
        <Panel as="aside">
          <PanelHeading title={t("common.details")} />
          <EventFacts event={event} venue={venue} />
          <CalendarLinks key={status} eventId={event.id} />
          {status === "authenticated" ? <ReportEventForm eventId={event.id} /> : null}
          {status === "authenticated" ? <SupportLink eventId={event.id} /> : null}
        </Panel>
      </div>
      <GetTicketsBar event={event} tickets={tickets} sectionRef={ticketsSection} />
    </>
  );
}
