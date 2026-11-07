import { NavLink, Outlet } from "react-router";
import { EmptyState, Loading, PageHeading, Panel } from "../../components/ui";
import { ADMIN_SECTIONS } from "./adminPaths";
import { useIsPlatformAdmin } from "./useIsPlatformAdmin";

// Shell for every admin page: heading, section links and the permission gate.
export function AdminLayout() {
  const { isAdmin, checking } = useIsPlatformAdmin();

  if (checking) return <Loading label="Checking admin access…" />;
  if (!isAdmin) {
    return (
      <>
        <PageHeading eyebrow="Platform administration" title="Admins only" />
        <Panel>
          <EmptyState>
            This area is for BiletFlow platform administrators. Your account does not have that role. Organizer ownership or staff access does not include it.
          </EmptyState>
        </Panel>
      </>
    );
  }

  return (
    <>
      <PageHeading
        eyebrow="Platform administration"
        title="Keep BiletFlow safe."
        subtitle="Search accounts, events, orders and tickets, review reports, and change platform settings. Every decision is recorded."
      />
      <nav className="admin-nav" aria-label="Admin sections">
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
