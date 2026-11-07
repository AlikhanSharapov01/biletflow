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
  { to: ADMIN_PATHS.users, label: "Users" },
  { to: ADMIN_PATHS.events, label: "Events" },
  { to: ADMIN_PATHS.orders, label: "Orders" },
  { to: ADMIN_PATHS.tickets, label: "Tickets" },
  { to: ADMIN_PATHS.reports, label: "Reports" },
  { to: ADMIN_PATHS.moderation, label: "Moderation log" },
  { to: ADMIN_PATHS.settings, label: "Settings" },
  { to: ADMIN_PATHS.exports, label: "CSV exports" },
];
