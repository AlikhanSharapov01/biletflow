import { Navigate, Route } from "react-router";
import { lazyPage } from "../../components/layout/lazyPage";
import { RequireAuth } from "../../components/layout/RequireAuth";
import { AdminLayout } from "./AdminLayout";
import { ADMIN_PATHS } from "./adminPaths";

const AdminEventsPage = lazyPage(() => import("./pages/AdminEventsPage"), (m) => m.AdminEventsPage);
const AdminExportsPage = lazyPage(() => import("./pages/AdminExportsPage"), (m) => m.AdminExportsPage);
const AdminInspectPage = lazyPage(() => import("./pages/AdminInspectPage"), (m) => m.AdminInspectPage);
const AdminJobsPage = lazyPage(() => import("./pages/AdminJobsPage"), (m) => m.AdminJobsPage);
const AdminModerationPage = lazyPage(() => import("./pages/AdminModerationPage"), (m) => m.AdminModerationPage);
const AdminOrdersPage = lazyPage(() => import("./pages/AdminOrdersPage"), (m) => m.AdminOrdersPage);
const AdminPaymentsPage = lazyPage(() => import("./pages/AdminPaymentsPage"), (m) => m.AdminPaymentsPage);
const AdminReportsPage = lazyPage(() => import("./pages/AdminReportsPage"), (m) => m.AdminReportsPage);
const AdminSettingsPage = lazyPage(() => import("./pages/AdminSettingsPage"), (m) => m.AdminSettingsPage);
const AdminTicketsPage = lazyPage(() => import("./pages/AdminTicketsPage"), (m) => m.AdminTicketsPage);
const AdminUsersPage = lazyPage(() => import("./pages/AdminUsersPage"), (m) => m.AdminUsersPage);

export { ADMIN_PATHS } from "./adminPaths";
export { useIsPlatformAdmin } from "./useIsPlatformAdmin";

// Signed-in admin portal under /admin/*. Place inside the AppShell route;
// AdminLayout shows a permission message to non-admins.
export const adminRoutes = (
  <>
    <Route element={<RequireAuth />}>
      <Route path={ADMIN_PATHS.root} element={<AdminLayout />}>
        <Route index element={<Navigate to={ADMIN_PATHS.users} replace />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="events" element={<AdminEventsPage />} />
        <Route path="orders" element={<AdminOrdersPage />} />
        <Route path="tickets" element={<AdminTicketsPage />} />
        <Route path="payments" element={<AdminPaymentsPage />} />
        <Route path="inspect" element={<AdminInspectPage />} />
        <Route path="jobs" element={<AdminJobsPage />} />
        <Route path="reports" element={<AdminReportsPage />} />
        <Route path="moderation" element={<AdminModerationPage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
        <Route path="exports" element={<AdminExportsPage />} />
        <Route path="*" element={<Navigate to={ADMIN_PATHS.users} replace />} />
      </Route>
    </Route>
  </>
);
