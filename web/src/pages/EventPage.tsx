import { Link, useParams } from "react-router";
import { getEvent, listCategories, listTicketTypes, listVenues } from "../api/catalog";
import { CheckoutPanel } from "../components/CheckoutPanel";
import { ErrorPanel, Loading } from "../components/Feedback";
import { useRequest } from "../hooks/useRequest";
import { dateLabel } from "../utils/format";

const VISIBILITY_LABEL = { public: "Public event", unlisted: "Unlisted event", private: "Private event" } as const;

export function EventPage() {
  const { eventId = "" } = useParams();

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
    <div className="event-page">
      <Link className="back-link" to="/discover">
        ← Back to events
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{category?.name_en ?? "Event"}</p>
          <h1>{event.title}</h1>
          <p>
            {dateLabel(event.starts_at)} – {dateLabel(event.ends_at)}
            {venue ? ` · ${venue.name} · ${venue.city}` : ""}
          </p>
        </div>
        <div className="heading-actions">
          <span className={`status ${event.publication_state === "published" ? "" : "neutral"}`}>
            {event.publication_state}
          </span>
        </div>
      </div>
      <div className="content-grid event-page-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>About this event</h2>
          </div>
          <p className="event-description">{event.description || "More details will be shared by the organizer."}</p>
          <div className="panel-heading checkout-heading">
            <h2>Tickets</h2>
          </div>
          <CheckoutPanel event={event} tickets={tickets} />
        </section>
        <aside className="panel">
          <div className="panel-heading">
            <h2>Details</h2>
          </div>
          <ul className="event-facts">
            <li>
              <strong>Venue</strong>
              {venue ? `${venue.name}, ${venue.address}, ${venue.city}` : "Venue details unavailable"}
            </li>
            <li>
              <strong>Time zone</strong>
              {event.time_zone}
            </li>
            <li>
              <strong>Registration</strong>
              {dateLabel(event.registration_opens_at)} – {dateLabel(event.registration_closes_at)}
            </li>
            <li>
              <strong>Doors</strong>
              {dateLabel(event.admission_opens_at)} – {dateLabel(event.admission_closes_at)}
            </li>
            <li>
              <strong>Capacity</strong>
              {event.capacity} · {event.seating_mode === "assigned" ? "Assigned seating" : "General admission"}
            </li>
            <li>
              <strong>Visibility</strong>
              {VISIBILITY_LABEL[event.visibility]}
            </li>
            <li>
              <strong>Refunds</strong>
              {event.refund_allowed ? `Allowed until ${dateLabel(event.refund_cutoff_at)}` : "Not offered"}
            </li>
          </ul>
        </aside>
      </div>
    </div>
  );
}
