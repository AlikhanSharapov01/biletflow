import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "../components/layout/AppShell";
import { RequireAuth } from "../components/layout/RequireAuth";
import { AccountPage } from "../features/account/AccountPage";
import { AcceptInvitationPage } from "../features/auth/AcceptInvitationPage";
import { AuthPage } from "../features/auth/AuthPage";
import { ResetPasswordPage } from "../features/auth/ResetPasswordPage";
import { VerifyEmailPage } from "../features/auth/VerifyEmailPage";
import { DiscoverPage } from "../features/discover/DiscoverPage";
import { EventPage } from "../features/events/EventPage";
import { adminRoutes } from "../features/admin/routes";
import { checkoutPublicRoutes } from "../features/checkout/routes";
import { notificationRoutes } from "../features/notifications/routes";
import { OrderPage } from "../features/orders/OrderPage";
import { OrdersPage } from "../features/orders/OrdersPage";
import { OrganizerEventPage } from "../features/organizer/event/OrganizerEventPage";
import { OrganizerPage } from "../features/organizer/workspace/OrganizerPage";
import { supportRoutes } from "../features/support/routes";
import { TicketPage } from "../features/tickets/TicketPage";
import { TicketsPage } from "../features/tickets/TicketsPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/discover" replace />} />
      <Route path="/sign-in" element={<AuthPage />} />
      {/* Pages opened from emailed links; the backend builds these paths. */}
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/staff-invitations/accept" element={<AcceptInvitationPage />} />
      </Route>
      <Route element={<AppShell />}>
        <Route path="/discover" element={<DiscoverPage />} />
        <Route path="/events/:eventId" element={<EventPage />} />
        {checkoutPublicRoutes}
        {adminRoutes}
        <Route element={<RequireAuth />}>
          <Route path="/tickets" element={<TicketsPage />} />
          <Route path="/tickets/:ticketId" element={<TicketPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/:orderId" element={<OrderPage />} />
          <Route path="/organizer" element={<OrganizerPage />} />
          <Route path="/organizer/events/:eventId" element={<OrganizerEventPage />} />
          <Route path="/account" element={<AccountPage />} />
          {supportRoutes}
          {notificationRoutes}
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/discover" replace />} />
    </Routes>
  );
}
