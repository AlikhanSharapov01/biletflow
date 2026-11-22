import { t } from "../../i18n";
import type { NavIconId } from "./NavIcon";

export interface NavItem {
  to: string;
  label: string;
  // Icon in the phone tab bar.
  icon: NavIconId;
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
  { to: "/discover", get label() { return t("nav.discover"); }, icon: "discover", sections: ["/discover", "/events"], public: true },
  { to: "/tickets", get label() { return t("common.tickets"); }, icon: "tickets", sections: ["/tickets"] },
  { to: "/orders", get label() { return t("common.orders"); }, icon: "orders", sections: ["/orders"] },
  { to: "/organizer", get label() { return t("nav.organizer"); }, icon: "organizer", sections: ["/organizer"] },
  { to: "/support", get label() { return t("nav.support"); }, icon: "support", sections: ["/support"] },
  { to: "/admin", get label() { return t("nav.admin"); }, icon: "admin", sections: ["/admin"], adminOnly: true },
];

export function isSectionActive(item: NavItem, pathname: string): boolean {
  return item.sections.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
