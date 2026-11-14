import { t } from "@/i18n";

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
  { id: "users", get label() { return t("admin.users"); }, glyph: "U", get meta() { return t("mobile.admin.users_hint"); } },
  { id: "events", get label() { return t("common.events"); }, glyph: "E", get meta() { return t("mobile.admin.events_hint"); } },
  { id: "orders", get label() { return t("common.orders"); }, glyph: "O", get meta() { return t("mobile.admin.orders_hint"); } },
  { id: "tickets", get label() { return t("common.tickets"); }, glyph: "T", get meta() { return t("mobile.admin.tickets_hint"); } },
  { id: "reports", get label() { return t("common.reports"); }, glyph: "!", get meta() { return t("mobile.admin.reports_hint"); } },
  { id: "moderation", get label() { return t("admin.moderation_log"); }, glyph: "M", get meta() { return t("mobile.admin.moderation_hint"); } },
  { id: "settings", get label() { return t("admin.settings"); }, glyph: "⚙", get meta() { return t("mobile.admin.settings_hint"); } },
  { id: "exports", get label() { return t("admin.exports"); }, glyph: "C", get meta() { return t("mobile.admin.exports_hint"); } },
];

export function adminSectionFor(id: string | undefined): (typeof ADMIN_SECTIONS)[number] | undefined {
  return ADMIN_SECTIONS.find((section) => section.id === id);
}
