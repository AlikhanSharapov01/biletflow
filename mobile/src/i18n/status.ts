import { getLocale, t, type TranslationKey } from "./index";

// Backend codes remain unchanged in requests, filters and records. Only their
// labels are localized. Unknown values (including custom seat categories) are
// retained so a newer server never loses useful information in an older client.
const LABELS: Record<string, TranslationKey> = {
  draft: "common.draft", published: "common.published", unpublished: "common.unpublished",
  cancelled: "common.cancelled", active: "common.active", upcoming: "common.upcoming", completed: "common.completed",
  normal: "admin.normal", suspended: "org.suspended", pending: "common.pending", confirmed: "common.confirmed",
  failed: "status.failed", succeeded: "status.succeeded", requested: "status.requested", created: "status.created",
  unknown: "status.unknown", refund_pending: "status.refund_pending", refunded: "common.refunded",
  valid: "status.valid", checked_in: "tickets.checked_in", incomplete: "status.incomplete",
  scheduled: "status.scheduled", ended: "status.ended", disabled: "common.disabled", verified: "status.verified",
  available: "checkout.available", held: "checkout.held", sold: "checkout.sold", blocked: "checkout.blocked",
  unavailable: "checkout.unavailable", released: "status.released", consumed: "status.consumed", expired: "tickets.expired",
  queued: "tickets.queued", sending: "tickets.sending", delivered: "tickets.delivered", none: "checkout.no_fee",
  open: "support.open", resolved: "support.resolved", in_progress: "support.in_progress",
  waiting_for_customer: "support.waiting_customer", reviewing: "admin.reviewing", current: "account.current",
  reversed: "tickets.reversed", online: "org.online", offline_sync: "org.offline_sync",
  revoked: "organizer.revoked", free: "common.free", paid: "common.paid", public: "status.public",
  private: "status.private", unlisted: "status.unlisted", standard: "status.standard", premium: "status.premium", vip: "status.vip",
  manage_profile: "status.manage_profile", manage_staff: "status.manage_staff", finance: "organizer.finance",
  event_edit: "capability.edit_event", attendees: "organizer.attendees", staff: "organizer.staff", reports: "common.reports",
  support: "nav.support", refund: "status.refund", scan: "capability.scan", reverse_checkin: "capability.reverse",
  fraud: "event.report_fraud", spam: "event.report_spam", inappropriate: "event.report_content",
  misleading: "event.report_misleading", safety: "event.report_safety", other: "event.report_other",
  ticket_not_valid: "api.ticket_invalid", already_checked_in: "api.already_checked_in", ticket_revoked: "status.ticket_revoked",
  admission_conflict: "status.admission_conflict", event: "status.event", organization: "status.organization",
  ticket: "common.ticket", ticket_type: "status.ticket_type", checkout: "status.checkout", payments: "status.payments",
  admission: "tickets.admission", paid_sales: "organizer.paid_sales", admin: "nav.admin", auth: "status.auth",
  terms: "status.terms", invitation: "status.invitation", staff_assignment: "status.staff_assignment", campaign: "org.campaign",
  price_category: "status.price_category", hold: "checkout.held", order: "common.order",
  updated: "history.updated", duplicated: "history.duplicated", reinstated: "history.reinstated",
  granted: "history.granted", accepted: "history.accepted", assigned: "history.assigned", started: "history.started",
  activated: "history.activated", quoted: "history.quoted", exported: "history.exported", synced: "history.synced",
  permissions: "history.permissions", seat: "history.seat", seats: "history.seats", member: "history.member",
  access: "history.access", identity: "history.identity", payout: "history.payout", profile: "history.profile",
  activation: "history.activation", setting: "history.setting", report: "history.report", user: "history.user",
  export: "history.export", offline_package: "history.offline_package", sync_conflict: "history.sync_conflict",
  issued: "history.issued", changed: "history.changed",
};

export function localizedStatus(value: string): string {
  if (getLocale() === "en") return value.replace(/_/g, " ");
  if (LABELS[value]) return t(LABELS[value]);
  return value.split(".").map((part) => {
    if (LABELS[part]) return t(LABELS[part]);
    const words = part.split("_");
    const result: string[] = [];
    for (let index = 0; index < words.length;) {
      let found = false;
      for (let size = Math.min(3, words.length - index); size > 0; size--) {
        const compound = words.slice(index, index + size).join("_");
        if (LABELS[compound]) { result.push(t(LABELS[compound])); index += size; found = true; break; }
      }
      if (!found) { result.push(words[index]!); index++; }
    }
    return result.join(" ");
  }).join(" · ");
}
