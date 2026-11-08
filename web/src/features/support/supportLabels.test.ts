import { describe, expect, it } from "vitest";
import type { SupportCase, SupportChange } from "../../api/types/support";
import {
  canEscalate,
  caseContext,
  categoryLabel,
  contextFromParams,
  contextLinks,
  describeChange,
  hasContext,
  isStaff,
  newCasePath,
  supportStatusLabel,
  supportStatusTone,
} from "./supportLabels";

const EVENT = "11111111-1111-4111-8111-111111111111";
const ORDER = "22222222-2222-4222-8222-222222222222";
const TICKET = "33333333-3333-4333-8333-333333333333";
const ORG = "44444444-4444-4444-8444-444444444444";

function supportCase(overrides: Partial<SupportCase> = {}): SupportCase {
  return {
    id: "c1",
    kind: "attendee",
    category: "delivery",
    subject: "Ticket missing",
    status: "open",
    requester: { id: "u1", display_name: "Aida" },
    organization_id: null,
    event_id: null,
    order_id: null,
    ticket_id: null,
    assigned_to: null,
    escalated_at: null,
    resolved_at: null,
    last_seq: 1,
    created_at: "2026-11-01T10:00:00Z",
    updated_at: "2026-11-01T10:00:00Z",
    viewer_roles: ["requester"],
    ...overrides,
  };
}

function change(overrides: Partial<SupportChange>): SupportChange {
  return {
    seq: 2,
    type: "change",
    id: "ch",
    case_id: "c1",
    actor: { id: "u2", display_name: "Dana" },
    change_kind: "status",
    before_value: "open",
    after_value: "resolved",
    reason: null,
    created_at: "2026-11-01T10:00:00Z",
    ...overrides,
  };
}

describe("labels", () => {
  it("labels known categories and humanises unknown ones", () => {
    expect(categoryLabel("event_info")).toBe("Event information");
    expect(categoryLabel("check_in")).toBe("Check-in");
    expect(categoryLabel("lost_and_found")).toBe("lost and found");
  });

  it("labels known statuses and humanises unknown ones", () => {
    expect(supportStatusLabel("waiting_for_customer")).toBe("Waiting for customer");
    expect(supportStatusLabel("on_hold")).toBe("on hold");
  });

  it("treats waiting and unknown statuses as needing action", () => {
    expect(supportStatusTone("waiting_for_customer")).toBe("pending");
    expect(supportStatusTone("something_else")).toBe("pending");
  });
});

describe("context from links", () => {
  it("reads all four ids, trims them and accepts upper-case UUIDs", () => {
    const params = new URLSearchParams({
      event_id: ` ${EVENT} `,
      order_id: ORDER.toUpperCase(),
      ticket_id: TICKET,
      organization_id: ORG,
    });
    expect(contextFromParams(params)).toEqual({ event_id: EVENT, order_id: ORDER.toUpperCase(), ticket_id: TICKET, organization_id: ORG });
  });

  it("drops malformed ids, injection attempts and unknown keys", () => {
    const params = new URLSearchParams({
      event_id: `${EVENT}/../admin`,
      order_id: "../../etc",
      ticket_id: `${TICKET}x`,
      user_id: EVENT,
    });
    expect(contextFromParams(params)).toEqual({});
  });

  it("knows when any context is set", () => {
    expect(hasContext({})).toBe(false);
    expect(hasContext({ event_id: "" })).toBe(false);
    expect(hasContext({ organization_id: ORG })).toBe(true);
  });

  it("builds a new-case path with every id in a stable order", () => {
    expect(newCasePath({ organization_id: ORG, ticket_id: TICKET, order_id: ORDER, event_id: EVENT })).toBe(
      `/support/new?event_id=${EVENT}&order_id=${ORDER}&ticket_id=${TICKET}&organization_id=${ORG}`,
    );
  });
});

describe("contextLinks", () => {
  it("links owners to every record except the organization", () => {
    expect(contextLinks({ event_id: EVENT, order_id: ORDER, ticket_id: TICKET, organization_id: ORG })).toEqual([
      { label: "Event", to: `/events/${EVENT}` },
      { label: "Order", to: `/orders/${ORDER}` },
      { label: "Ticket", to: `/tickets/${TICKET}` },
      { label: "Organization", to: null },
    ]);
  });

  it("never links staff to another person's order or ticket", () => {
    const links = contextLinks({ event_id: EVENT, order_id: ORDER, ticket_id: TICKET }, false);
    expect(links).toEqual([
      { label: "Event", to: `/events/${EVENT}` },
      { label: "Order", to: null },
      { label: "Ticket", to: null },
    ]);
  });

  it("encodes ids in paths", () => {
    expect(contextLinks({ event_id: "a/b?c" })[0]?.to).toBe("/events/a%2Fb%3Fc");
  });

  it("returns nothing without context", () => {
    expect(contextLinks({})).toEqual([]);
  });
});

describe("case helpers", () => {
  it("turns null record ids into missing context", () => {
    expect(caseContext(supportCase({ event_id: EVENT, order_id: null }))).toEqual({
      event_id: EVENT,
      order_id: undefined,
      ticket_id: undefined,
      organization_id: undefined,
    });
  });

  it("recognises support and platform viewers as staff, but not requesters", () => {
    expect(isStaff(supportCase({ viewer_roles: ["requester"] }))).toBe(false);
    expect(isStaff(supportCase({ viewer_roles: ["support"] }))).toBe(true);
    expect(isStaff(supportCase({ viewer_roles: ["platform"] }))).toBe(true);
    expect(isStaff(supportCase({ viewer_roles: [] }))).toBe(false);
  });

  it("lets only organizer support escalate an open attendee case, once", () => {
    const base = { viewer_roles: ["support" as const], kind: "attendee" as const };
    expect(canEscalate(supportCase(base))).toBe(true);
    expect(canEscalate(supportCase({ ...base, viewer_roles: ["requester"] }))).toBe(false);
    expect(canEscalate(supportCase({ ...base, viewer_roles: ["platform"] }))).toBe(false);
    expect(canEscalate(supportCase({ ...base, kind: "organizer_platform" }))).toBe(false);
    expect(canEscalate(supportCase({ ...base, escalated_at: "2026-11-01T11:00:00Z" }))).toBe(false);
    expect(canEscalate(supportCase({ ...base, status: "resolved" }))).toBe(false);
    expect(canEscalate(supportCase({ ...base, status: "waiting_for_customer" }))).toBe(true);
  });
});

describe("describeChange", () => {
  it("describes status changes, including a missing target status", () => {
    expect(describeChange(change({}))).toBe("Dana changed the status to resolved");
    expect(describeChange(change({ after_value: null }))).toBe("Dana changed the status to a new status");
    expect(describeChange(change({ after_value: "waiting_for_customer", reason: "requester_reply" }))).toBe(
      "Reopened as waiting for customer after a reply",
    );
  });

  it("describes assignment changes", () => {
    expect(describeChange(change({ change_kind: "assignment", after_value: "u3" }))).toBe("Dana assigned the case");
    expect(describeChange(change({ change_kind: "assignment", after_value: null }))).toBe("Dana unassigned the case");
    expect(describeChange(change({ change_kind: "assignment", after_value: null, reason: "escalated" }))).toBe(
      "Organizer assignment cleared on escalation",
    );
  });

  it("describes escalation and unknown kinds", () => {
    expect(describeChange(change({ change_kind: "escalation" }))).toBe("Dana escalated the case to the BiletFlow platform team");
    expect(describeChange(change({ change_kind: "priority" }))).toBe("Dana updated the case");
  });
});
