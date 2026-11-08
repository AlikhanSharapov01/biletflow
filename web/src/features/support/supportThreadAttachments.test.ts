import { describe, expect, it } from "vitest";
import type { SupportChange, SupportMessage } from "../../api/types/support";
import { ACCEPTED_ATTACHMENT_TYPES, attachmentProblem, fileSizeLabel, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_MESSAGE } from "./attachments";
import { createRetryKeys } from "./retryKey";
import { lastSeq, mergeThreadItems } from "./thread";

function message(seq: number, body = "hi"): SupportMessage {
  return {
    seq,
    type: "message",
    id: `m${seq}`,
    case_id: "c1",
    author: { id: "u1", display_name: "Aida" },
    author_role: "requester",
    client_message_id: `k${seq}`,
    body,
    created_at: "2026-11-01T10:00:00Z",
    replayed: false,
    attachments: [],
  };
}

function change(seq: number): SupportChange {
  return {
    seq,
    type: "change",
    id: `ch${seq}`,
    case_id: "c1",
    actor: { id: "u2", display_name: "Dana" },
    change_kind: "status",
    before_value: "open",
    after_value: "in_progress",
    reason: null,
    created_at: "2026-11-01T10:00:00Z",
  };
}

describe("mergeThreadItems edge cases", () => {
  it("returns the current array untouched for an empty page", () => {
    const current = [message(1)];
    expect(mergeThreadItems(current, [])).toBe(current);
  });

  it("keeps the first copy of a seq instead of a later duplicate", () => {
    const merged = mergeThreadItems([message(1, "original")], [message(1, "replayed"), message(2)]);
    expect(merged.map((item) => (item.type === "message" ? item.body : item.change_kind))).toEqual(["original", "hi"]);
  });

  it("interleaves messages and history changes by seq", () => {
    const merged = mergeThreadItems([message(3)], [change(2), message(1)]);
    expect(merged.map((item) => `${item.type}:${item.seq}`)).toEqual(["message:1", "change:2", "message:3"]);
  });

  it("does not mutate either input", () => {
    const current = [message(2)];
    const incoming = [message(1)];
    mergeThreadItems(current, incoming);
    expect(current.map((item) => item.seq)).toEqual([2]);
    expect(incoming.map((item) => item.seq)).toEqual([1]);
  });

  it("reports zero as the last seq of an empty thread", () => {
    expect(lastSeq([])).toBe(0);
    expect(lastSeq([message(7), change(4)])).toBe(7);
  });
});

describe("attachment limits", () => {
  it("mirrors the SUPPORT_API.md defaults", () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(5 * 1024 * 1024);
    expect(MAX_ATTACHMENTS_PER_MESSAGE).toBe(5);
    expect([...ACCEPTED_ATTACHMENT_TYPES].sort()).toEqual(["application/pdf", "image/jpeg", "image/png"]);
  });

  it("accepts a file of exactly the limit and rejects one byte more", () => {
    expect(attachmentProblem({ name: "max.jpg", type: "image/jpeg", size: MAX_ATTACHMENT_BYTES })).toBeNull();
    expect(attachmentProblem({ name: "big.jpg", type: "image/jpeg", size: MAX_ATTACHMENT_BYTES + 1 })).toBe(
      "big.jpg is 5.0 MB; the limit is 5.0 MB.",
    );
  });

  it("checks the type before the size, so an empty unsupported file names its type", () => {
    expect(attachmentProblem({ name: "x.exe", type: "application/x-msdownload", size: 0 })).toBe(
      "x.exe: only PNG, JPEG and PDF files can be attached.",
    );
    // A type-less file (unknown extension in the browser) is rejected too.
    expect(attachmentProblem({ name: "notes", type: "", size: 10 })).toContain("only PNG, JPEG and PDF");
  });

  it("labels sizes in B, KB and MB at the boundaries", () => {
    expect(fileSizeLabel(0)).toBe("0 B");
    expect(fileSizeLabel(1023)).toBe("1023 B");
    expect(fileSizeLabel(1024)).toBe("1 KB");
    expect(fileSizeLabel(1024 * 1024 - 1)).toBe("1024 KB");
    expect(fileSizeLabel(1024 * 1024)).toBe("1.0 MB");
    expect(fileSizeLabel(1.25 * 1024 * 1024)).toBe("1.3 MB");
  });
});

describe("createRetryKeys edge cases", () => {
  it("rotates the key when only attachments change", () => {
    let n = 0;
    const keys = createRetryKeys(() => `k${++n}`);
    expect(keys.keyFor({ body: "a", attachment_ids: [] })).toBe("k1");
    expect(keys.keyFor({ body: "a", attachment_ids: ["f1"] })).toBe("k2");
  });

  it("does not return to an older key when the payload is reverted", () => {
    let n = 0;
    const keys = createRetryKeys(() => `k${++n}`);
    keys.keyFor({ body: "a" });
    keys.keyFor({ body: "b" });
    // Only the last payload is remembered; reusing k1 could replay a stale send.
    expect(keys.keyFor({ body: "a" })).toBe("k3");
  });

  it("generates UUID keys by default", () => {
    const key = createRetryKeys().keyFor({ body: "a" });
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
