// Event times are always shown in the event's own time zone, never the
// device's (docs/BiletFlow_Backend_Requirements.md §2.2 rule 6). Only the
// language/format follows the device locale.
export function formatEventWindow(startsAt: string, endsAt: string, timeZone: string): string {
  try {
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    const day = new Intl.DateTimeFormat(undefined, {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    const time = new Intl.DateTimeFormat(undefined, {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
    });
    const zone = new Intl.DateTimeFormat(undefined, { timeZone, timeZoneName: "short" })
      .formatToParts(start)
      .find((part) => part.type === "timeZoneName")?.value;

    const sameDay = day.format(start) === day.format(end);
    const range = sameDay
      ? `${day.format(start)}, ${time.format(start)}–${time.format(end)}`
      : `${day.format(start)}, ${time.format(start)} – ${day.format(end)}, ${time.format(end)}`;
    return zone ? `${range} (${zone})` : range;
  } catch {
    // Runtime without Intl time-zone support: fall back to the raw timestamps.
    return `${startsAt} – ${endsAt}`;
  }
}

// A single moment, e.g. "19:42" today or "Sat 10 Oct, 19:42" on another day,
// in the event's time zone.
export function formatEventMoment(at: string, timeZone: string): string {
  try {
    const moment = new Date(at);
    const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone, dateStyle: "short" });
    const time = new Intl.DateTimeFormat(undefined, {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(moment);
    if (dayKey.format(moment) === dayKey.format(new Date())) {
      return time;
    }
    const day = new Intl.DateTimeFormat(undefined, {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(moment);
    return `${day}, ${time}`;
  } catch {
    return at;
  }
}
