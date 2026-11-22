import { useEffect, useRef, useState, type RefObject } from "react";
import type { EventView, TicketType } from "../../../api/types";
import { Button } from "../../../components/ui/Button";
import { t, useLocale } from "../../../i18n";
import { ticketAvailability } from "../../checkout/utils/checkout";
import { eventOffer } from "../../discover/eventOffer";

export const TICKETS_SECTION_ID = "tickets-section";
export const TICKETS_HEADING_ID = "tickets";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const BAR_HEIGHT_PROPERTY = "--sticky-bar-height";

// What the bar offers when checkout is possible right now: the event is published and not
// suspended, tickets are still on sale (the card's own rules), and at least one public
// ticket type can be bought. Null otherwise.
function buyableOffer(event: EventView, tickets: TicketType[], now: Date): string | null {
  if (event.publication_state !== "published" || event.moderation_state !== "normal") return null;
  const offer = eventOffer(event, now);
  if (offer.kind !== "free" && offer.kind !== "from") return null;
  return tickets.some((type) => ticketAvailability(type, event, now).purchasable) ? offer.label : null;
}

export function canGetTickets(event: EventView, tickets: TicketType[], now = new Date()): boolean {
  return buyableOffer(event, tickets, now) !== null;
}

function pixels(value: string): number {
  return Number.parseFloat(value) || 0;
}

// Phones only (the stylesheet hides it elsewhere): the offer and a button that jumps to the
// ticket section. It slides away while that section is really on screen.
export function GetTicketsBar({ event, tickets, sectionRef }: { event: EventView; tickets: TicketType[]; sectionRef: RefObject<HTMLElement | null> }) {
  useLocale();
  const barRef = useRef<HTMLDivElement>(null);
  // null: the observer has not reported yet. The bar waits hidden so it never flashes on load.
  const [onScreen, setOnScreen] = useState<boolean | null>(null);
  const [height, setHeight] = useState(0);
  const label = buyableOffer(event, tickets, new Date());
  const buyable = label !== null;
  const observed = typeof IntersectionObserver !== "undefined";

  // The bar's real height drives the spacer and the scroll padding (text size, wrapping, safe area).
  useEffect(() => {
    const bar = barRef.current;
    if (!buyable || !bar) return;
    const root = document.documentElement;
    const measure = () => {
      setHeight(bar.offsetHeight);
      root.style.setProperty(BAR_HEIGHT_PROPERTY, `${bar.offsetHeight}px`);
    };
    measure();
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    resize?.observe(bar);
    return () => {
      resize?.disconnect();
      root.style.removeProperty(BAR_HEIGHT_PROPERTY);
    };
  }, [buyable]);

  // Hide only when the section is visible between the top bar and this bar (plus the tab bar).
  useEffect(() => {
    const section = sectionRef.current;
    const bar = barRef.current;
    if (!buyable || !section || !bar || !observed) return;
    const top = pixels(getComputedStyle(document.documentElement).scrollPaddingTop);
    const bottom = bar.offsetHeight + pixels(getComputedStyle(bar).bottom);
    const observer = new IntersectionObserver(
      (entries) => setOnScreen(entries[entries.length - 1]?.isIntersecting ?? false),
      { rootMargin: [-top, 0, -bottom, 0].map((value) => `${value}px`).join(" ") },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [buyable, observed, sectionRef, height]);

  if (!buyable) return null;

  function goToTickets() {
    const heading = document.getElementById(TICKETS_HEADING_ID);
    if (!heading) return;
    const reduced = window.matchMedia?.(REDUCED_MOTION).matches ?? false;
    heading.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    heading.focus({ preventScroll: true });
  }

  const hidden = observed && onScreen !== false;
  // A hidden bar is inert so its button leaves the tab order while it is off screen.
  return (
    <>
      <div className="get-tickets-spacer" aria-hidden="true" />
      <div
        ref={barRef}
        className="get-tickets-bar"
        data-hidden={hidden ? "" : undefined}
        data-ready={onScreen === null ? undefined : ""}
        aria-hidden={hidden ? true : undefined}
        inert={hidden}
      >
        <p className="get-tickets-offer">{label}</p>
        <Button variant="primary" onClick={goToTickets}>{t("event.get_tickets")}</Button>
      </div>
    </>
  );
}
