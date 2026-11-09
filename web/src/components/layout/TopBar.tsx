import { t, useLocale } from "../../i18n";
import { Link, useLocation } from "react-router";
import { useAuth } from "../../features/auth/AuthContext";
import { NotificationBell } from "../../features/notifications/components/NotificationBell";
import { Brand } from "../ui/Brand";
import { ButtonLink } from "../ui/Button";
import { AvatarMenu } from "./AvatarMenu";
import { isSectionActive } from "./navigation";
import { useNavItems } from "./useNavItems";
import { LanguageSwitcher } from "../../i18n/LanguageSwitcher";

// Brand on the left, the primary tabs (wide screens), then notifications and
// the avatar menu, or a sign-in button for visitors.
export function TopBar() {
  useLocale();
  const { status, profile, signOut } = useAuth();
  const location = useLocation();
  const items = useNavItems();

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Brand to="/discover" />
        <nav className="top-tabs" aria-label={t("nav.main")}>
          {items.map((item) => (
            <Link
              key={item.to}
              className="top-tab"
              to={item.to}
              aria-current={isSectionActive(item, location.pathname) ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="topbar-actions">
          <LanguageSwitcher />
          {profile ? (
            <>
              <NotificationBell />
              <AvatarMenu profile={profile} onSignOut={() => void signOut()} />
            </>
          ) : (
            <ButtonLink variant="primary" size="sm" to="/sign-in" state={{ from: location.pathname }}>
              {status === "restoring" ? t("auth.checking") : t("auth.sign_in")}
            </ButtonLink>
          )}
        </div>
      </div>
    </header>
  );
}
