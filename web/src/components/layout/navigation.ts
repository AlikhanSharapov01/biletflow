import { t } from "../../i18n";
export interface NavItem {
  to: string;
  label: string;
  // Letter in the phone tab bar, as in mobile's (tabs)/_layout.
  glyph: string;
  // Path prefixes that count as this section.
  sections: string[];
  // Shown to visitors who are not signed in.
  public?: boolean;
  // Shown only to platform admins (GET /api/v1/admin/me succeeds).
  adminOnly?: boolean;
}

// Primary sections. Account is reached from the avatar menu, as on mobile.
// Admin is shown only to platform admins; the server still checks every call.
export const NAV_ITEMS: NavItem[] = [
  { to: "/discover", get label() { return t("nav.discover"); }, glyph: "D", sections: ["/discover", "/events"], public: true },
  { to: "/tickets", get label() { return t("common.tickets"); }, glyph: "T", sections: ["/tickets"] },
  { to: "/orders", get label() { return t("common.orders"); }, glyph: "R", sections: ["/orders"] },
  { to: "/organizer", get label() { return t("nav.organizer"); }, glyph: "O", sections: ["/organizer"] },
  { to: "/support", get label() { return t("nav.support"); }, glyph: "S", sections: ["/support"] },
  { to: "/admin", get label() { return t("nav.admin"); }, glyph: "A", sections: ["/admin"], adminOnly: true },
];

export function isSectionActive(item: NavItem, pathname: string): boolean {
  return item.sections.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
