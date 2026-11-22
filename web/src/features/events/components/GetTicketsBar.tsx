import { useEffect, useState } from "react";
import type { EventView, TicketType } from "../../../api/types";
import { Button } from "../../../components/ui/Button";
import { t, useLocale } from "../../../i18n";
import { eventOffer } from "../../discover/eventOffer";

export const TICKETS_SECTION_ID = "tickets-section";
export const TICKETS_HEADING_ID = "tickets";
const REDUCED_MOTION = "(prefers-reduced-motion:reduce)";

// Checkout is possible: published, not over, not sold out, and a public ticket type exists.
export function canGetTickets(event: EventView, tickets: TicketType[]): boolean {
  return event.publication_state === "published" && event.time_status !== "completed" && !event.sold_out && tickets.length > 0;
}

// Phones only (the stylesheet hides it above 960px): the offer and a button that jumps
// to the ticket section. It slides away while that section is on screen.
export function GetTicketsBar({ event, tickets }: { event: EventView; tickets: TicketType[] }) {
  useLocale();
  const [hidden, setHidden] = useState(false);
  const buyable = canGetTickets(event, tickets);

  useEffect(() => {
    const section = document.getElementById(TICKETS_SECTION_ID);
    if (!buyable || !section || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => setHidden(entries[entries.length - 1]?.isIntersecting ?? false));
    observer.observe(section);
    return () => {
      observer.disconnect();
      setHidden(false);
    };
  }, [buyable]);

  if (!buyable) return null;

  function goToTickets() {
    const heading = document.getElementById(TICKETS_HEADING_ID);
    if (!heading) return;
    const reduced = window.matchMedia?.(REDUCED_MOTION).matches ?? false;
    heading.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    heading.focus({ preventScroll: true });
  }

  // A hidden bar is inert so its button leaves the tab order while it is off screen.
  return (
    <>
      <div className="get-tickets-spacer" aria-hidden="true" />
      <div className="get-tickets-bar" data-hidden={hidden ? "" : undefined} aria-hidden={hidden ? true : undefined} inert={hidden}>
        <p className="get-tickets-offer">{eventOffer(event).label}</p>
        <Button variant="primary" onClick={goToTickets}>{t("event.get_tickets")}</Button>
      </div>
    </>
  );
}
