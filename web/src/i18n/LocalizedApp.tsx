import { useEffect } from "react";
import { useAuth } from "../features/auth/AuthContext";
import { AppRoutes } from "../app/routes";
import { ActionDialogHost } from "../components/ui/ActionDialog";
import { setLocale, t, useLocale } from "./index";

export function LocalizedApp() {
  const locale = useLocale();
  const { profile } = useAuth();
  useEffect(() => {
    if (profile) setLocale(profile.locale);
  }, [profile?.id, profile?.locale]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = t("document.title");
  }, [locale]);
  // Re-render without remounting forms or losing reservations.
  return <><AppRoutes /><ActionDialogHost /></>;
}
