import { useState } from "react";
import { updateProfile } from "../api/auth";
import { useAuth } from "../features/auth/AuthContext";
import { useToast } from "../components/ui/Toast";
import { isLocale, setLocale, t, useLocale } from "./index";

export function LanguageSwitcher() {
  const locale = useLocale();
  const { profile, setProfile } = useAuth();
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const change = async (next: string) => {
    if (!isLocale(next)) return;
    if (!profile) { setLocale(next); return; }
    setBusy(true);
    try {
      const updated = await updateProfile({ locale: next });
      setProfile(updated);
      setLocale(updated.locale);
    } catch { notify(t("account.language_error")); }
    finally { setBusy(false); }
  };
  return (
    <label className="language-switcher">
      <span className="visually-hidden">{t("account.language")}</span>
      <select value={locale} disabled={busy} onChange={(event) => void change(event.target.value)}>
        <option value="kk" lang="kk">Қазақша</option>
        <option value="ru" lang="ru">Русский</option>
        <option value="en" lang="en">English</option>
      </select>
    </label>
  );
}
