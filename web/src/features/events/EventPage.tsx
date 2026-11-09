import { categoryName, t, useLocale } from "../../i18n";
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
  useLocale();
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

  if (page.loading) return <Loading label={t("event.loading")} />;
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
      <div className="content-grid">
        <Panel>
          <PanelHeading title={t("event.about")} />
          <p className="event-description">{event.description || t("event.more_details")}</p>
          <div className="checkout-heading">
            <PanelHeading title={t("common.tickets")} />
          </div>
          <CheckoutPanel key={event.id} event={event} tickets={tickets} promoFromUrl={searchParams.get("promo")} />
        </Panel>
        <Panel as="aside">
          <PanelHeading title={t("common.details")} />
          <EventFacts event={event} venue={venue} />
          <CalendarLinks key={status} eventId={event.id} />
          {status === "authenticated" ? <ReportEventForm eventId={event.id} /> : null}
          {status === "authenticated" ? <SupportLink eventId={event.id} /> : null}
        </Panel>
      </div>
    </>
  );
}
