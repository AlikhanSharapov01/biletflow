import { t } from "../../i18n";
// Route constants for the platform-admin portal (all signed-in, under /admin).
export const ADMIN_PATHS = {
  root: "/admin",
  users: "/admin/users",
  events: "/admin/events",
  orders: "/admin/orders",
  tickets: "/admin/tickets",
  reports: "/admin/reports",
  moderation: "/admin/moderation",
  settings: "/admin/settings",
  exports: "/admin/exports",
} as const;

export const ADMIN_SECTIONS: Array<{ to: string; label: string }> = [
  { to: ADMIN_PATHS.users, get label() { return t("admin.users"); } },
  { to: ADMIN_PATHS.events, get label() { return t("common.events"); } },
  { to: ADMIN_PATHS.orders, get label() { return t("common.orders"); } },
  { to: ADMIN_PATHS.tickets, get label() { return t("common.tickets"); } },
  { to: ADMIN_PATHS.reports, get label() { return t("common.reports"); } },
  { to: ADMIN_PATHS.moderation, get label() { return t("admin.moderation_log"); } },
  { to: ADMIN_PATHS.settings, get label() { return t("admin.settings"); } },
  { to: ADMIN_PATHS.exports, get label() { return t("admin.exports"); } },
];
