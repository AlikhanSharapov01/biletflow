import { t, useLocale } from "../../../i18n";
import type { AppNotification } from "../../../api/types/notifications";
import { dateLabel } from "../../../utils/format";
import { notificationContent } from "../notificationContent";

interface NotificationRowProps {
  notification: AppNotification;
  busy: boolean;
  onOpen: (notification: AppNotification) => void;
}

const KIND_GLYPH: Record<string, string> = {
  event_updated: "E",
  event_cancelled: "E",
  ticket_delivered: "T",
  support_reply: "S",
  support_status: "S",
};

// One inbox entry. Unread items are bold with a dot; activating the row marks
// it read and opens its target.
export function NotificationRow({ notification, busy, onOpen }: NotificationRowProps) {
  useLocale();
  const unread = !notification.read_at;
  const content = notificationContent(notification);
  return (
    <li>
      <button
        type="button"
        className={`notification-row ${unread ? "unread" : ""}`}
        disabled={busy}
        onClick={() => onOpen(notification)}
      >
        <span className="row-icon" aria-hidden="true">
          {KIND_GLYPH[notification.kind] ?? "N"}
        </span>
        <span className="notification-copy">
          <strong className="notification-title">
            {unread ? <span className="notification-dot" aria-label={t("notifications.unread")} /> : null}
            {content.title}
          </strong>
          <span className="notification-body">{content.body}</span>
          <time className="notification-time" dateTime={notification.created_at}>
            {dateLabel(notification.created_at)}
          </time>
        </span>
      </button>
    </li>
  );
}
