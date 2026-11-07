import { Navigate, Route } from "react-router";
import { RequireAuth } from "../../components/layout/RequireAuth";
import { AdminLayout } from "./AdminLayout";
import { ADMIN_PATHS } from "./adminPaths";
import { AdminEventsPage } from "./pages/AdminEventsPage";
import { AdminExportsPage } from "./pages/AdminExportsPage";
import { AdminModerationPage } from "./pages/AdminModerationPage";
import { AdminOrdersPage } from "./pages/AdminOrdersPage";
import { AdminReportsPage } from "./pages/AdminReportsPage";
import { AdminSettingsPage } from "./pages/AdminSettingsPage";
import { AdminTicketsPage } from "./pages/AdminTicketsPage";
import { AdminUsersPage } from "./pages/AdminUsersPage";

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
        <Route path="reports" element={<AdminReportsPage />} />
        <Route path="moderation" element={<AdminModerationPage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
        <Route path="exports" element={<AdminExportsPage />} />
        <Route path="*" element={<Navigate to={ADMIN_PATHS.users} replace />} />
      </Route>
    </Route>
  </>
);
