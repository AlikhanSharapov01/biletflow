import type { AppNotification } from "../../api/types/notifications";
import { t, type TranslationKey } from "../../i18n";
import { dateLabel } from "../../utils/format";
import { notificationPath } from "./notificationTarget";

const KINDS = ["event_updated", "event_cancelled", "ticket_delivered", "support_reply", "support_status", "purchase_confirmed", "payment_failed", "refund_started", "refund_completed", "order_cancelled"] as const;

/** Render archived notices in the current UI language, rather than the language
 * saved when the worker first created them. Wording matches the backend. */
export function notificationContent(notice: AppNotification): { title: string; body: string } {
  if (!(KINDS as readonly string[]).includes(notice.kind)) return { title: notice.title, body: notice.body };
  const payload = notice.payload;
  const zone = typeof payload.time_zone === "string" ? payload.time_zone : "Asia/Almaty";
  let when = "";
  if (typeof payload.starts_at === "string") {
    try { when = dateLabel(payload.starts_at, { dateStyle: "medium", timeStyle: "short", timeZone: zone }); }
    catch { when = dateLabel(payload.starts_at); }
  }
  const path = notificationPath(notice);
  const values = {
    title: typeof payload.title === "string" ? payload.title : "",
    when, zone, link: path ? `${window.location.origin}${path}` : "",
  };
  return {
    title: t(`notice.${notice.kind}.title` as TranslationKey, values),
    body: t(`notice.${notice.kind}.body` as TranslationKey, values),
  };
}
