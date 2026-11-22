import { useId, type ReactNode } from "react";
import { Link } from "react-router";
import { DateTile } from "./DateTile";
import { EventImage } from "./EventImage";

interface EventCardProps {
  title: string;
  // Makes the title a link.
  to?: string;
  // The title link also covers the whole card and is its only link, so `footer` must hold
  // no links or buttons. Needs `to`; the footer text is read as the link's description.
  coverLink?: boolean;
  eyebrow?: string;
  // One line per entry.
  meta?: ReactNode | ReactNode[];
  // Discover-style artwork panel: gradient by index, category initial.
  art?: { index: number; letter: string };
  // The event's cover, drawn over the artwork once it loads.
  cover?: { src: string; alt: string } | null;
  // Row-style card with a date tile instead of artwork.
  date?: string | null;
  footer?: ReactNode;
  // Extra content under the card body, e.g. an inline form.
  children?: ReactNode;
}

// Mobile's EventCard (artwork, category, serif title, meta, footer) and its
// date-tile row variant, used by every event-like list.
export function EventCard({ title, to, coverLink, eyebrow, meta, art, cover, date, footer, children }: EventCardProps) {
  const lines = Array.isArray(meta) ? meta : meta ? [meta] : [];
  const baseId = useId();
  const footerId = `${baseId}-offer`;
  const wholeCardLink = Boolean(to) && Boolean(coverLink) && !children;
  // The cover link reads the offer first, then the date and venue lines.
  const describedBy = wholeCardLink
    ? [footer ? footerId : "", ...lines.map((_, index) => `${baseId}-meta-${index}`)].filter(Boolean).join(" ") || undefined
    : undefined;
  const classes = ["event-card", art ? "" : "event-card-row", wholeCardLink ? "event-card-linked" : ""].filter(Boolean).join(" ");
  return (
    <article className={classes}>
      {art ? (
        <div className={`event-card-art art-${art.index % 4}`}>
          <span aria-hidden="true">{art.letter}</span>
          {cover ? <EventImage className="event-card-cover" src={cover.src} alt={cover.alt} /> : null}
        </div>
      ) : null}
      <div className="event-card-body">
        {date !== undefined ? <DateTile at={date} /> : null}
        <div className="event-card-copy">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h3>{to ? <Link to={to} aria-describedby={describedBy}>{title}</Link> : title}</h3>
          {lines.map((line, index) => (
            <p className="event-card-meta" key={index} id={wholeCardLink ? `${baseId}-meta-${index}` : undefined}>
              {line}
            </p>
          ))}
          {footer ? <div className="event-card-foot" id={wholeCardLink ? footerId : undefined}>{footer}</div> : null}
        </div>
      </div>
      {children ? <div className="event-card-extra">{children}</div> : null}
    </article>
  );
}
