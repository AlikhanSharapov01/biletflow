import { t, useLocale } from "../../i18n";
import { NavLink, Outlet } from "react-router";
import { EmptyState, Loading, PageHeading, Panel } from "../../components/ui";
import { ADMIN_SECTIONS } from "./adminPaths";
import { useIsPlatformAdmin } from "./useIsPlatformAdmin";

// Shell for every admin page: heading, section links and the permission gate.
export function AdminLayout() {
  useLocale();
  const { isAdmin, checking } = useIsPlatformAdmin();

  if (checking) return <Loading label={t("admin.checking")} />;
  if (!isAdmin) {
    return (
      <>
        <PageHeading eyebrow={t("admin.eyebrow")} title={t("admin.only")} />
        <Panel>
          <EmptyState>{t("admin.access_hint")}</EmptyState>
        </Panel>
      </>
    );
  }

  return (
    <>
      <PageHeading
        eyebrow={t("admin.eyebrow")}
        title={t("admin.title")}
        subtitle={t("admin.subtitle")}
      />
      <nav className="admin-nav" aria-label={t("admin.sections")}>
        {ADMIN_SECTIONS.map((section) => (
          <NavLink key={section.to} to={section.to} className="admin-nav-link">
            {section.label}
          </NavLink>
        ))}
      </nav>
      <div className="admin-content">
        <Outlet />
      </div>
    </>
  );
}
