import type { EventInput, EventView, TicketType, TicketTypeInput } from "../api/types";
import { browserTimeZone, isoToLocalInput, localInputToIso, tengeToMinor } from "./format";

// Form models hold strings as the inputs produce them; these helpers turn them
// into the exact payloads the backend expects and report the first problem.

export interface EventFormValues {
  title: string;
  description: string;
  category_id: string;
  venue_id: string;
  visibility: EventInput["visibility"];
  capacity: string;
  starts_at: string;
  ends_at: string;
  registration_opens_at: string;
  registration_closes_at: string;
  admission_opens_at: string;
  admission_closes_at: string;
  refund_allowed: boolean;
  refund_cutoff_at: string;
  time_zone: string;
}

export function eventFormValues(initial?: EventView): EventFormValues {
  return {
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    category_id: initial?.category_id ?? "",
    venue_id: initial?.venue_id ?? "",
    visibility: initial?.visibility ?? "public",
    capacity: initial ? String(initial.capacity) : "50",
    starts_at: isoToLocalInput(initial?.starts_at),
    ends_at: isoToLocalInput(initial?.ends_at),
    registration_opens_at: isoToLocalInput(initial?.registration_opens_at),
    registration_closes_at: isoToLocalInput(initial?.registration_closes_at),
    admission_opens_at: isoToLocalInput(initial?.admission_opens_at),
    admission_closes_at: isoToLocalInput(initial?.admission_closes_at),
    refund_allowed: initial?.refund_allowed ?? false,
    refund_cutoff_at: isoToLocalInput(initial?.refund_cutoff_at),
    time_zone: initial?.time_zone ?? browserTimeZone(),
  };
}

export type EventFormResult = { ok: true; input: EventInput } | { ok: false; error: string };

// Blank window fields derive from the event times: registration opens now and
// closes at the start, admission runs from start to end.
export function toEventInput(values: EventFormValues, initial?: EventView, now: Date = new Date()): EventFormResult {
  const starts = localInputToIso(values.starts_at);
  const ends = localInputToIso(values.ends_at);
  if (!starts || !ends) return { ok: false, error: "Choose a start and an end time." };
  if (ends <= starts) return { ok: false, error: "The end time must be after the start time." };
  if (!initial && new Date(starts) <= now) return { ok: false, error: "Choose a start time in the future." };

  const capacity = Number(values.capacity);
  if (!Number.isInteger(capacity) || capacity < 0 || capacity > 100000) {
    return { ok: false, error: "Capacity must be a whole number between 0 and 100,000." };
  }
  if (!values.category_id || !values.venue_id) return { ok: false, error: "Choose a category and a venue." };
  if (!values.title.trim()) return { ok: false, error: "Give the event a title." };

  const registrationOpens = values.registration_opens_at ? localInputToIso(values.registration_opens_at) : now.toISOString();
  const registrationCloses = values.registration_closes_at ? localInputToIso(values.registration_closes_at) : starts;
  const admissionOpens = values.admission_opens_at ? localInputToIso(values.admission_opens_at) : starts;
  const admissionCloses = values.admission_closes_at ? localInputToIso(values.admission_closes_at) : ends;
  if (!registrationOpens || !registrationCloses || !admissionOpens || !admissionCloses) {
    return { ok: false, error: "One of the window times could not be read." };
  }
  if (registrationCloses <= registrationOpens) return { ok: false, error: "Registration must close after it opens." };

  let refundCutoff: string | null = null;
  if (values.refund_allowed) {
    refundCutoff = localInputToIso(values.refund_cutoff_at);
    if (!refundCutoff) return { ok: false, error: "Set a refund cutoff when refunds are allowed." };
    if (refundCutoff > starts) return { ok: false, error: "The refund cutoff cannot be after the event starts." };
  }

  return {
    ok: true,
    input: {
      title: values.title.trim(),
      description: values.description,
      category_id: values.category_id,
      venue_id: values.venue_id,
      venue_layout_id: initial?.venue_layout_id ?? null,
      visibility: values.visibility,
      seating_mode: initial?.seating_mode ?? "general",
      capacity,
      starts_at: starts,
      ends_at: ends,
      time_zone: values.time_zone.trim() || browserTimeZone(),
      registration_opens_at: registrationOpens,
      registration_closes_at: registrationCloses,
      admission_opens_at: admissionOpens,
      admission_closes_at: admissionCloses,
      refund_allowed: values.refund_allowed,
      refund_cutoff_at: refundCutoff,
    },
  };
}

export interface TicketTypeFormValues {
  name: string;
  description: string;
  kind: "free" | "paid";
  price: string;
  quantity_limit: string;
  per_order_limit: string;
  sales_open_at: string;
  sales_close_at: string;
  is_hidden: boolean;
}

export function ticketTypeFormValues(initial?: TicketType): TicketTypeFormValues {
  return {
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    kind: initial?.kind ?? "free",
    price: initial ? String(initial.price_minor / 100) : "0",
    quantity_limit: initial ? String(initial.quantity_limit) : "",
    per_order_limit: initial ? String(initial.per_order_limit) : "5",
    sales_open_at: isoToLocalInput(initial?.sales_open_at),
    sales_close_at: isoToLocalInput(initial?.sales_close_at),
    is_hidden: initial?.is_hidden ?? false,
  };
}

export type TicketTypeFormResult = { ok: true; input: TicketTypeInput } | { ok: false; error: string };

// Blank sales windows default to the event's registration window.
export function toTicketTypeInput(values: TicketTypeFormValues, event: EventView): TicketTypeFormResult {
  const quantity = Number(values.quantity_limit);
  const perOrder = Number(values.per_order_limit);
  if (!values.name.trim()) return { ok: false, error: "Give the ticket type a name." };
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > event.capacity) {
    return { ok: false, error: `Quantity must be a whole number up to the event capacity (${event.capacity}).` };
  }
  if (!Number.isInteger(perOrder) || perOrder < 1 || perOrder > 100) {
    return { ok: false, error: "The per-order limit must be between 1 and 100." };
  }
  const priceMinor = values.kind === "paid" ? tengeToMinor(values.price) : 0;
  if (values.kind === "paid" && priceMinor <= 0) return { ok: false, error: "Paid tickets need a price above zero." };

  const opens = values.sales_open_at ? localInputToIso(values.sales_open_at) : event.registration_opens_at;
  const closes = values.sales_close_at ? localInputToIso(values.sales_close_at) : event.registration_closes_at;
  if (!opens || !closes) return { ok: false, error: "One of the sales window times could not be read." };
  if (closes <= opens) return { ok: false, error: "Sales must close after they open." };

  return {
    ok: true,
    input: {
      name: values.name.trim(),
      description: values.description,
      kind: values.kind,
      price_minor: priceMinor,
      quantity_limit: quantity,
      per_order_limit: perOrder,
      sales_open_at: opens,
      sales_close_at: closes,
      is_hidden: values.is_hidden,
    },
  };
}
