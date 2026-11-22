import { Navigate, Route } from "react-router";
import { RequireAuth } from "../../components/layout/RequireAuth";
import { ADMIN_PATHS } from "./adminPaths";
import { lazyPage } from "../../app/lazyPage";

const AdminLayout = lazyPage(() => import("./AdminLayout").then((m) => ({ default: m.AdminLayout })));
const AdminEventsPage = lazyPage(() => import("./pages/AdminEventsPage").then((m) => ({ default: m.AdminEventsPage })));
const AdminExportsPage = lazyPage(() => import("./pages/AdminExportsPage").then((m) => ({ default: m.AdminExportsPage })));
const AdminInspectPage = lazyPage(() => import("./pages/AdminInspectPage").then((m) => ({ default: m.AdminInspectPage })));
const AdminJobsPage = lazyPage(() => import("./pages/AdminJobsPage").then((m) => ({ default: m.AdminJobsPage })));
const AdminModerationPage = lazyPage(() => import("./pages/AdminModerationPage").then((m) => ({ default: m.AdminModerationPage })));
const AdminOrdersPage = lazyPage(() => import("./pages/AdminOrdersPage").then((m) => ({ default: m.AdminOrdersPage })));
const AdminPaymentsPage = lazyPage(() => import("./pages/AdminPaymentsPage").then((m) => ({ default: m.AdminPaymentsPage })));
const AdminReportsPage = lazyPage(() => import("./pages/AdminReportsPage").then((m) => ({ default: m.AdminReportsPage })));
const AdminSettingsPage = lazyPage(() => import("./pages/AdminSettingsPage").then((m) => ({ default: m.AdminSettingsPage })));
const AdminTicketsPage = lazyPage(() => import("./pages/AdminTicketsPage").then((m) => ({ default: m.AdminTicketsPage })));
const AdminUsersPage = lazyPage(() => import("./pages/AdminUsersPage").then((m) => ({ default: m.AdminUsersPage })));

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
