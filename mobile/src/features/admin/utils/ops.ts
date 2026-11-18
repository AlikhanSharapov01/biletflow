import type { AdminCampaignRow, InspectKind, OpsFilters, WorkKind } from "@/api/types/admin";
import { t } from "@/i18n";
import { priceLabel, statusLabel } from "@/utils/format";
import type { StatusTone } from "@/utils/status";

// Status filters each view accepts (ADMIN_API.md). Campaigns filter on
// enabled instead, which the phone does not offer.
export const OPS_STATUSES: Record<InspectKind | WorkKind, string[]> = {
  "support-cases": ["open", "in_progress", "waiting_for_customer", "resolved"],
  activations: ["incomplete", "pending", "active", "failed", "suspended"],
  campaigns: [],
  "sync-conflicts": ["open", "resolved"],
  jobs: ["pending", "leased", "done", "dead"],
  "notification-deliveries": ["pending", "sent", "failed"],
};

// Views with literal text search (subject or case id; campaign name or id).
export const OPS_TEXT_SEARCH: ReadonlySet<string> = new Set(["support-cases", "campaigns"]);

export interface OpsDraft {
  q: string;
  status: string;
  event_id: string;
}

export const EMPTY_OPS_DRAFT: OpsDraft = { q: "", status: "", event_id: "" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OpsFilterResult = { ok: true; filters: OpsFilters } | { ok: false; error: string };

// The server answers 422 for a malformed id, so a partial id is caught here
// with a clearer message. Empty fields are left out.
export function toOpsFilters(draft: OpsDraft): OpsFilterResult {
  const eventId = draft.event_id.trim();
  if (eventId && !UUID.test(eventId)) return { ok: false, error: t("mobile.admin.full_id_needed") };
  const filters: OpsFilters = {};
  if (draft.q.trim()) filters.q = draft.q.trim();
  if (draft.status) filters.status = draft.status;
  if (eventId) filters.event_id = eventId;
  return { ok: true, filters };
}

export function opsTone(status: string): StatusTone {
  if (["done", "sent", "active", "resolved", "confirmed", "succeeded", "valid"].includes(status)) return "positive";
  if (["dead", "failed", "suspended"].includes(status)) return "blocked";
  if (["pending", "leased", "open", "in_progress", "waiting_for_customer", "incomplete"].includes(status)) return "pending";
  return "neutral";
}

export const shortId = (id: string | null | undefined) => (id ? id.slice(0, 8) : "—");

// "10%" or a fixed amount such as "₸500.00".
export function campaignDiscount(row: Pick<AdminCampaignRow, "discount_kind" | "percentage_bps" | "fixed_minor">): string {
  if (row.discount_kind === "percentage") return `${(row.percentage_bps ?? 0) / 100}%`;
  return priceLabel(row.fixed_minor ?? 0);
}

// The allowlisted ids a job carries, e.g. "Order 1f584efb · Case 587b73c8".
const CONTEXT_LABELS: Array<[string, () => string]> = [
  ["order_id", () => t("common.order")],
  ["ticket_id", () => t("common.ticket")],
  ["case_id", () => t("mobile.admin.case")],
  ["refund_id", () => t("checkout.refund")],
  ["payout_id", () => t("history.payout")],
  ["user_id", () => t("history.user")],
  ["recipient_user_id", () => t("admin.recipient")],
];

export function contextLine(context: Record<string, string | number>): string {
  const parts: string[] = [];
  if (typeof context.notice === "string") parts.push(statusLabel(context.notice));
  if (typeof context.purpose === "string") parts.push(statusLabel(context.purpose));
  for (const [key, label] of CONTEXT_LABELS) {
    const value = context[key];
    if (typeof value === "string") parts.push(`${label()} ${shortId(value)}`);
  }
  return parts.join(" · ");
}
