import { TrafficAnalytics } from "../analytics/TrafficAnalytics";
import { BrowserRouter } from "react-router";
import { ToastProvider } from "../components/ui/Toast";
import { AuthProvider } from "../features/auth/AuthContext";
import { LocalizedApp } from "../i18n/LocalizedApp";

export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <TrafficAnalytics />
          <LocalizedApp />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
