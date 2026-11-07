import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../../features/auth/AuthContext";
import { Loading } from "../ui/Feedback";

// Wraps routes that need a signed-in account. Anonymous visitors go to the
// sign-in page and come back to where they were afterwards.
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "restoring") return <Loading label="Checking for an active session…" />;
  if (status === "anonymous") return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
