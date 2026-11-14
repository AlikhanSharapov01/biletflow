import type { EventInput, EventView, SeatingMode, TicketType, TicketTypeInput } from "@/api/types";
import { browserTimeZone, tengeToMinor } from "@/utils/format";
import { readLocalInput, toLocalInput } from "./dateInput";
import { t } from "@/i18n";

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
  // Left undefined on a new form so an edit keeps the event's own setting.
  seating_mode?: SeatingMode;
  venue_layout_id?: string;
}

export function eventFormValues(initial?: EventView): EventFormValues {
  return {
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    category_id: initial?.category_id ?? "",
    venue_id: initial?.venue_id ?? "",
    visibility: initial?.visibility ?? "public",
    capacity: initial ? String(initial.capacity) : "50",
    starts_at: toLocalInput(initial?.starts_at),
    ends_at: toLocalInput(initial?.ends_at),
    registration_opens_at: toLocalInput(initial?.registration_opens_at),
    registration_closes_at: toLocalInput(initial?.registration_closes_at),
    admission_opens_at: toLocalInput(initial?.admission_opens_at),
    admission_closes_at: toLocalInput(initial?.admission_closes_at),
    refund_allowed: initial?.refund_allowed ?? false,
    refund_cutoff_at: toLocalInput(initial?.refund_cutoff_at),
    time_zone: initial?.time_zone ?? browserTimeZone(),
    seating_mode: initial?.seating_mode,
    venue_layout_id: initial?.venue_layout_id ?? undefined,
  };
}

export type EventFormResult = { ok: true; input: EventInput } | { ok: false; error: string };

// Blank window fields derive from the event times: registration opens now and
// closes at the start, admission runs from start to end.
export function toEventInput(values: EventFormValues, initial?: EventView, now: Date = new Date()): EventFormResult {
  const starts = readLocalInput(values.starts_at);
  const ends = readLocalInput(values.ends_at);
  if (!starts || !ends) return { ok: false, error: t("org.validation_times") };
  if (ends <= starts) return { ok: false, error: t("org.validation_end") };
  if (!initial && new Date(starts) <= now) return { ok: false, error: t("org.validation_future") };

  const capacity = Number(values.capacity);
  if (!Number.isInteger(capacity) || capacity < 0 || capacity > 100000) {
    return { ok: false, error: t("org.validation_capacity") };
  }
  if (!values.category_id || !values.venue_id) return { ok: false, error: t("org.validation_category_venue") };
  if (!values.title.trim()) return { ok: false, error: t("org.validation_title") };
  const seatingMode = values.seating_mode ?? initial?.seating_mode ?? "general";
  const layoutId = seatingMode === "assigned" ? (values.venue_layout_id ?? initial?.venue_layout_id ?? null) || null : null;
  if (seatingMode === "assigned" && !layoutId) return { ok: false, error: t("org.validation_layout") };

  const registrationOpens = values.registration_opens_at ? readLocalInput(values.registration_opens_at) : now.toISOString();
  const registrationCloses = values.registration_closes_at ? readLocalInput(values.registration_closes_at) : starts;
  const admissionOpens = values.admission_opens_at ? readLocalInput(values.admission_opens_at) : starts;
  const admissionCloses = values.admission_closes_at ? readLocalInput(values.admission_closes_at) : ends;
  if (!registrationOpens || !registrationCloses || !admissionOpens || !admissionCloses) {
    return { ok: false, error: t("org.validation_window") };
  }
  if (registrationCloses <= registrationOpens) return { ok: false, error: t("org.validation_registration") };

  let refundCutoff: string | null = null;
  if (values.refund_allowed) {
    refundCutoff = readLocalInput(values.refund_cutoff_at);
    if (!refundCutoff) return { ok: false, error: t("org.validation_refund_cutoff") };
    if (refundCutoff > starts) return { ok: false, error: t("org.validation_refund_before_start") };
  }

  return {
    ok: true,
    input: {
      title: values.title.trim(),
      description: values.description,
      category_id: values.category_id,
      venue_id: values.venue_id,
      venue_layout_id: layoutId,
      visibility: values.visibility,
      seating_mode: seatingMode,
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
    sales_open_at: toLocalInput(initial?.sales_open_at),
    sales_close_at: toLocalInput(initial?.sales_close_at),
    is_hidden: initial?.is_hidden ?? false,
  };
}

export type TicketTypeFormResult = { ok: true; input: TicketTypeInput } | { ok: false; error: string };

// Blank sales windows default to the event's registration window.
export function toTicketTypeInput(values: TicketTypeFormValues, event: EventView): TicketTypeFormResult {
  const quantity = Number(values.quantity_limit);
  const perOrder = Number(values.per_order_limit);
  if (!values.name.trim()) return { ok: false, error: t("org.validation_ticket_name") };
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > event.capacity) {
    return { ok: false, error: t("org.validation_ticket_quantity", { p0: event.capacity }) };
  }
  if (!Number.isInteger(perOrder) || perOrder < 1 || perOrder > 100) {
    return { ok: false, error: t("org.validation_order_limit") };
  }
  const priceMinor = values.kind === "paid" ? tengeToMinor(values.price) : 0;
  if (values.kind === "paid" && priceMinor <= 0) return { ok: false, error: t("org.validation_paid_price") };

  const opens = values.sales_open_at ? readLocalInput(values.sales_open_at) : event.registration_opens_at;
  const closes = values.sales_close_at ? readLocalInput(values.sales_close_at) : event.registration_closes_at;
  if (!opens || !closes) return { ok: false, error: t("org.validation_sales_times") };
  if (closes <= opens) return { ok: false, error: t("org.validation_sales_close") };

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
