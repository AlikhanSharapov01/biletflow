import type { SupportChange, SupportMessage, SupportThreadItem } from "@/api/types/support";

import { attachmentProblem, attachmentType, fileSizeLabel, MAX_ATTACHMENT_BYTES } from "./attachments";
import { createRetryKeys } from "./retryKey";
import { contextFromParams, contextLinks, describeChange, newCaseHref, supportStatusTone } from "./supportLabels";
import { lastSeq, mergeThreadItems } from "./thread";

const EVENT = "11111111-1111-4111-8111-111111111111";
const ORDER = "22222222-2222-4222-8222-222222222222";

function message(seq: number): SupportMessage {
  return {
    seq,
    type: "message",
    id: `m${seq}`,
    case_id: "c1",
    author: { id: "u1", display_name: "Aida" },
    author_role: "requester",
    client_message_id: `k${seq}`,
    body: "hi",
    created_at: "2026-11-01T10:00:00Z",
    replayed: false,
    attachments: [],
  };
}

function change(overrides: Partial<SupportChange>): SupportChange {
  return {
    seq: 9,
    type: "change",
    id: "ch",
    case_id: "c1",
    actor: { id: "u2", display_name: "Dana" },
    change_kind: "status",
    before_value: "open",
    after_value: "in_progress",
    reason: null,
    created_at: "2026-11-01T10:00:00Z",
    ...overrides,
  };
}

describe("mergeThreadItems", () => {
  it("dedupes by seq and keeps seq order", () => {
    const current: SupportThreadItem[] = [message(1), message(3)];
    const merged = mergeThreadItems(current, [message(3), message(2), message(4)]);
    expect(merged.map((item) => item.seq)).toEqual([1, 2, 3, 4]);
    expect(lastSeq(merged)).toBe(4);
  });

  it("returns the same array when nothing is new", () => {
    const current = [message(1)];
    expect(mergeThreadItems(current, [message(1)])).toBe(current);
  });
});

describe("support context", () => {
  it("keeps only UUID context params and builds the new-case link", () => {
    const context = contextFromParams({ event_id: EVENT, order_id: "nope", ticket_id: "" });
    expect(context).toEqual({ event_id: EVENT });
    expect(newCaseHref({ event_id: EVENT, order_id: ORDER })).toEqual({
      pathname: "/support/new",
      params: { eventId: EVENT, orderId: ORDER },
    });
    expect(newCaseHref({})).toBe("/support/new");
  });

  it("reads the app's camelCase route params", () => {
    expect(contextFromParams({ eventId: EVENT, orderId: [ORDER], ticketId: "bad" })).toEqual({ event_id: EVENT, order_id: ORDER });
  });

  it("does not link orders for staff who do not own them", () => {
    expect(contextLinks({ order_id: ORDER }, false)).toEqual([{ label: "Order", href: null }]);
    expect(contextLinks({ order_id: ORDER })[0]?.href).toEqual({ pathname: "/orders/[orderId]", params: { orderId: ORDER } });
  });
});

describe("labels", () => {
  it("maps statuses to tones", () => {
    expect(supportStatusTone("open")).toBe("pending");
    expect(supportStatusTone("in_progress")).toBe("positive");
    expect(supportStatusTone("resolved")).toBe("neutral");
  });

  it("describes history items", () => {
    expect(describeChange(change({}))).toBe("Dana changed the status to in progress");
    expect(describeChange(change({ after_value: "open", reason: "requester_reply" }))).toBe("Reopened as open after a reply");
    expect(describeChange(change({ change_kind: "escalation" }))).toContain("escalated");
  });
});

describe("attachments", () => {
  it("accepts PNG, JPEG and PDF within the size limit", () => {
    expect(attachmentProblem({ name: "a.png", type: "image/png", size: 10 })).toBeNull();
    expect(attachmentProblem({ name: "a.gif", type: "image/gif", size: 10 })).toContain("PNG, JPEG and PDF");
    expect(attachmentProblem({ name: "a.pdf", type: "application/pdf", size: 0 })).toContain("empty");
    expect(attachmentProblem({ name: "a.pdf", type: "application/pdf", size: MAX_ATTACHMENT_BYTES + 1 })).toContain("5.0 MB");
    expect(fileSizeLabel(2048)).toBe("2 KB");
  });

  it("leaves an unknown size to the server and guesses missing types", () => {
    expect(attachmentProblem({ name: "a.pdf", type: "application/pdf" })).toBeNull();
    expect(attachmentType("photo.JPG")).toBe("image/jpeg");
    expect(attachmentType("scan.pdf", "application/pdf")).toBe("application/pdf");
    expect(attachmentType("notes.txt")).toBe("application/octet-stream");
  });
});

describe("createRetryKeys", () => {
  it("reuses a key for the identical payload and rotates it on change", () => {
    let n = 0;
    const keys = createRetryKeys(() => `key-${++n}`);
    expect(keys.keyFor({ body: "a" })).toBe("key-1");
    expect(keys.keyFor({ body: "a" })).toBe("key-1");
    expect(keys.keyFor({ body: "b" })).toBe("key-2");
    keys.reset();
    expect(keys.keyFor({ body: "b" })).toBe("key-3");
  });
});
