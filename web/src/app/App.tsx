import { BrowserRouter } from "react-router";
import { ToastProvider } from "../components/ui/Toast";
import { AuthProvider } from "../features/auth/AuthContext";
import { AppRoutes } from "./routes";

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
