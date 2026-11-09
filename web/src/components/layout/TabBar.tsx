import { t, useLocale } from "../../i18n";
import { Link, useLocation } from "react-router";
import { useAuth } from "../../features/auth/AuthContext";
import { isSectionActive } from "./navigation";
import { useNavItems } from "./useNavItems";

// Phone navigation (under 760px): a fixed bottom bar of lettered glyphs, like
// mobile's tab bar. Visitors only have Discover, which the brand already links.
export function TabBar() {
  useLocale();
  const { profile } = useAuth();
  const { pathname } = useLocation();
  const items = useNavItems();
  if (!profile) return null;

  return (
    <nav className="tab-bar" aria-label={t("nav.main")} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((item) => (
        <Link
          key={item.to}
          className="tab-bar-link"
          to={item.to}
          aria-current={isSectionActive(item, pathname) ? "page" : undefined}
        >
          <span className="nav-glyph" aria-hidden="true">
            {item.glyph}
          </span>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
