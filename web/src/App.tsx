import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AuthProvider } from "./auth/AuthContext";
import { AppShell } from "./components/AppShell";
import { RequireAuth } from "./components/RequireAuth";
import { ToastProvider } from "./components/Toast";
import { AccountPage } from "./pages/AccountPage";
import { AuthPage } from "./pages/AuthPage";
import { DiscoverPage } from "./pages/DiscoverPage";
import { EventPage } from "./pages/EventPage";
import { OrderPage, OrdersPage } from "./pages/OrdersPage";
import { OrganizerEventPage } from "./pages/OrganizerEventPage";
import { OrganizerPage } from "./pages/OrganizerPage";
import { TicketPage, TicketsPage } from "./pages/TicketsPage";
import { AcceptInvitationPage, ResetPasswordPage, VerifyEmailPage } from "./pages/TokenPages";

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
        <Route element={<RequireAuth />}>
          <Route path="/tickets" element={<TicketsPage />} />
          <Route path="/tickets/:ticketId" element={<TicketPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/:orderId" element={<OrderPage />} />
          <Route path="/organizer" element={<OrganizerPage />} />
          <Route path="/organizer/events/:eventId" element={<OrganizerEventPage />} />
          <Route path="/account" element={<AccountPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/discover" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
