// Sections of the platform-admin portal, opened at /admin/[section].
export const ADMIN_SECTION_IDS = [
  "users",
  "events",
  "orders",
  "tickets",
  "reports",
  "moderation",
  "settings",
  "exports",
] as const;

export type AdminSectionId = (typeof ADMIN_SECTION_IDS)[number];

export const ADMIN_SECTIONS: Array<{ id: AdminSectionId; label: string; glyph: string; meta: string }> = [
  { id: "users", label: "Users", glyph: "U", meta: "Search accounts, suspend or reinstate" },
  { id: "events", label: "Events", glyph: "E", meta: "Search events, suspend or reinstate" },
  { id: "orders", label: "Orders", glyph: "O", meta: "Search by buyer email or order id" },
  { id: "tickets", label: "Tickets", glyph: "T", meta: "Search by recipient email or ticket id" },
  { id: "reports", label: "Reports", glyph: "!", meta: "Review and resolve event reports" },
  { id: "moderation", label: "Moderation log", glyph: "M", meta: "Every suspension and reinstatement" },
  { id: "settings", label: "Settings", glyph: "⚙", meta: "Versioned platform settings" },
  { id: "exports", label: "CSV exports", glyph: "C", meta: "Audited CSV downloads" },
];

export function adminSectionFor(id: string | undefined): (typeof ADMIN_SECTIONS)[number] | undefined {
  return ADMIN_SECTIONS.find((section) => section.id === id);
}
