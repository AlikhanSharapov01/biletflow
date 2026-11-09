import { t, useLocale } from "../../i18n";
import { Outlet } from "react-router";
import { useAuth } from "../../features/auth/AuthContext";
import { TabBar } from "./TabBar";
import { TopBar } from "./TopBar";

// Signed-in and public pages: top bar, a centred content column, and the
// bottom tab bar on phones.
export function AppShell() {
  useLocale();
  const { profile } = useAuth();

  return (
    <div className={`app-shell ${profile ? "with-tab-bar" : ""}`}>
      <a className="skip-link" href="#main-content">{t("nav.skip")}</a>
      <TopBar />
      <main className="app-main" id="main-content" tabIndex={-1}>
        <div className="page">
          <Outlet />
        </div>
      </main>
      <TabBar />
    </div>
  );
}
