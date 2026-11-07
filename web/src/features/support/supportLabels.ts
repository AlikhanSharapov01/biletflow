import type {
  SupportCase,
  SupportCaseKind,
  SupportCategory,
  SupportChange,
  SupportContext,
  SupportStatus,
} from "../../api/types/support";
import type { StatusTone } from "../../utils/status";

export const CATEGORY_LABELS: Record<SupportCategory, string> = {
  delivery: "Ticket delivery",
  payment: "Payment",
  refund: "Refund",
  seating: "Seating",
  event_info: "Event information",
  check_in: "Check-in",
  account: "Account",
  technical: "Technical problem",
};

export const STATUS_LABELS: Record<SupportStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  waiting_for_customer: "Waiting for customer",
  resolved: "Resolved",
};

export const KIND_LABELS: Record<SupportCaseKind, string> = {
  attendee: "About an event, order or ticket",
  organizer_platform: "Organizer question for the platform",
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category as SupportCategory] ?? category.replace(/_/g, " ");
}

export function supportStatusLabel(status: string): string {
  return STATUS_LABELS[status as SupportStatus] ?? status.replace(/_/g, " ");
}

// Open and waiting cases need someone to act; resolved ones are done.
export function supportStatusTone(status: string): StatusTone {
  if (status === "in_progress") return "positive";
  if (status === "resolved") return "neutral";
  return "pending";
}

const CONTEXT_KEYS = ["event_id", "order_id", "ticket_id", "organization_id"] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Reads `?event_id=&order_id=&ticket_id=&organization_id=`; values that are not
// UUIDs are dropped so a mangled link never reaches the API.
export function contextFromParams(params: URLSearchParams): SupportContext {
  const context: SupportContext = {};
  for (const key of CONTEXT_KEYS) {
    const value = params.get(key)?.trim();
    if (value && UUID_PATTERN.test(value)) context[key] = value;
  }
  return context;
}

export function hasContext(context: SupportContext): boolean {
  return CONTEXT_KEYS.some((key) => Boolean(context[key]));
}

export function newCasePath(context: SupportContext): string {
  const params = new URLSearchParams();
  for (const key of CONTEXT_KEYS) {
    const value = context[key];
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `/support/new?${query}` : "/support/new";
}

export interface ContextLink {
  label: string;
  to: string | null;
}

// Links the viewer can follow from a case header or context chip. Orders and
// tickets only open for their owner, so staff see a plain label instead.
export function contextLinks(context: SupportContext, ownsRecords = true): ContextLink[] {
  const links: ContextLink[] = [];
  if (context.event_id) links.push({ label: "Event", to: `/events/${encodeURIComponent(context.event_id)}` });
  if (context.order_id) links.push({ label: "Order", to: ownsRecords ? `/orders/${encodeURIComponent(context.order_id)}` : null });
  if (context.ticket_id) links.push({ label: "Ticket", to: ownsRecords ? `/tickets/${encodeURIComponent(context.ticket_id)}` : null });
  if (context.organization_id) links.push({ label: "Organization", to: null });
  return links;
}

export function caseContext(supportCase: SupportCase): SupportContext {
  return {
    event_id: supportCase.event_id ?? undefined,
    order_id: supportCase.order_id ?? undefined,
    ticket_id: supportCase.ticket_id ?? undefined,
    organization_id: supportCase.organization_id ?? undefined,
  };
}

export function isStaff(supportCase: SupportCase): boolean {
  return supportCase.viewer_roles.includes("support") || supportCase.viewer_roles.includes("platform");
}

// Organizer support staff escalate their attendee cases to the platform once.
export function canEscalate(supportCase: SupportCase): boolean {
  return (
    supportCase.viewer_roles.includes("support") &&
    supportCase.kind === "attendee" &&
    !supportCase.escalated_at &&
    supportCase.status !== "resolved"
  );
}

// One line for a history item in the thread.
export function describeChange(change: SupportChange): string {
  const who = change.actor.display_name;
  if (change.change_kind === "status") {
    const to = change.after_value ? supportStatusLabel(change.after_value) : "a new status";
    if (change.reason === "requester_reply") return `Reopened as ${to.toLowerCase()} after a reply`;
    return `${who} changed the status to ${to.toLowerCase()}`;
  }
  if (change.change_kind === "assignment") {
    if (change.reason === "escalated") return "Organizer assignment cleared on escalation";
    return change.after_value ? `${who} assigned the case` : `${who} unassigned the case`;
  }
  if (change.change_kind === "escalation") return `${who} escalated the case to the BiletFlow platform team`;
  return `${who} updated the case`;
}
