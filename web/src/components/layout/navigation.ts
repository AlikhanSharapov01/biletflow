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
  { to: "/discover", label: "Discover", glyph: "D", sections: ["/discover", "/events"], public: true },
  { to: "/tickets", label: "Tickets", glyph: "T", sections: ["/tickets"] },
  { to: "/orders", label: "Orders", glyph: "R", sections: ["/orders"] },
  { to: "/organizer", label: "Organizer", glyph: "O", sections: ["/organizer"] },
  { to: "/support", label: "Support", glyph: "S", sections: ["/support"] },
  { to: "/admin", label: "Admin", glyph: "A", sections: ["/admin"], adminOnly: true },
];

export function isSectionActive(item: NavItem, pathname: string): boolean {
  return item.sections.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
