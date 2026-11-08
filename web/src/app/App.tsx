import { TrafficAnalytics } from "../analytics/TrafficAnalytics";
import { BrowserRouter } from "react-router";
import { ToastProvider } from "../components/ui/Toast";
import { AuthProvider } from "../features/auth/AuthContext";
import { AppRoutes } from "./routes";

export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <TrafficAnalytics />
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
