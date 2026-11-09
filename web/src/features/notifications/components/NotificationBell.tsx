import { t, useLocale } from "../../../i18n";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { unreadNotificationCount } from "../../../api/notifications";
import { NOTIFICATIONS_CHANGED, unreadBadgeLabel } from "../notificationTarget";

const REFRESH_MS = 60_000;

function BellIcon() {
  useLocale();
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

// Top-bar bell with the unread count. Refreshed on every route change, every
// minute while the tab is visible, and when the inbox marks items read.
// Render it only for signed-in users.
export function NotificationBell() {
  useLocale();
  const { pathname } = useLocation();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let active = true;
    const load = () => {
      unreadNotificationCount()
        .then((count) => {
          if (active) setUnread(count);
        })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, REFRESH_MS);
    window.addEventListener(NOTIFICATIONS_CHANGED, load);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener(NOTIFICATIONS_CHANGED, load);
    };
  }, [pathname]);

  const label = unread > 0 ? t("notifications.unread_count", { p0: unread }) : t("nav.notifications");
  return (
    <Link className="icon-button notification-bell" to="/notifications" aria-label={label}>
      <BellIcon />
      {unread > 0 ? (
        <span className="notification-badge" aria-hidden="true">
          {unreadBadgeLabel(unread)}
        </span>
      ) : null}
    </Link>
  );
}
