import { t, useLocale } from "../../i18n";
import { Link, useLocation } from "react-router";
import { useAuth } from "../../features/auth/AuthContext";
import { NavIcon } from "./NavIcon";
import { isSectionActive } from "./navigation";
import { useNavItems } from "./useNavItems";

// Phone navigation (up to 1024px): a fixed bottom bar of icons above full labels.
// Visitors only have Discover, which the brand already links.
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
          aria-label={item.tabLabel.replaceAll("\u00ad", "")}
          aria-current={isSectionActive(item, pathname) ? "page" : undefined}
        >
          <NavIcon id={item.icon} />
          <span className="tab-bar-label">{item.tabLabel}</span>
        </Link>
      ))}
    </nav>
  );
}
