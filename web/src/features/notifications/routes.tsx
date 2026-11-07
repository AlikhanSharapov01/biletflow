import { Route } from "react-router";
import { NotificationsPage } from "./NotificationsPage";

// Signed-in notification routes. Place inside the AppShell's <RequireAuth> group.
export const notificationRoutes = (
  <>
    <Route path="/notifications" element={<NotificationsPage />} />
  </>
);
