import { setLocale, t, useLocale } from "../../../i18n";
import { useState, type FormEvent } from "react";
import * as authApi from "../../../api/auth";
import { describeError } from "../../../api/errors";
import type { Locale, Profile } from "../../../api/types";
import { Button } from "../../../components/ui/Button";
import { FormMessage } from "../../../components/ui/Feedback";
import { CheckboxField, SelectField, TextField } from "../../../components/ui/Field";
import { Panel, PanelHeading } from "../../../components/ui/Panel";
import { StatusPill } from "../../../components/ui/StatusPill";
import { useToast } from "../../../components/ui/Toast";

const LOCALES: Array<[Locale, string]> = [
  ["en", "English"],
  ["kk", "Қазақша"],
  ["ru", "Русский"],
];

export function ProfileForm({ profile, onSaved }: { profile: Profile; onSaved: (profile: Profile) => void }) {
  useLocale();
  const { notify } = useToast();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: "", success: false });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setMessage({ text: "", success: false });
    try {
      const updated = await authApi.updateProfile({
        display_name: String(data.get("display_name") ?? "").trim(),
        locale: String(data.get("locale") ?? "en") as Locale,
        analytics_consent: data.get("analytics_consent") === "on",
      });
      onSaved(updated);
      setLocale(updated.locale);
      notify(t("account.updated"));
      setMessage({ text: t("common.saved"), success: true });
    } catch (failure) {
      setMessage({ text: describeError(failure), success: false });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel>
      <PanelHeading
        title={t("account.profile")}
        trailing={
          <StatusPill tone={profile.email_verified_at ? "positive" : "pending"}>
            {profile.email_verified_at ? t("account.verified") : t("account.not_verified")}
          </StatusPill>
        }
      />
      <p className="account-email">{profile.email}</p>
      <form className="form-stack" onSubmit={(event) => void handleSubmit(event)}>
        <TextField label={t("account.display_name")} name="display_name" required minLength={1} maxLength={100} defaultValue={profile.display_name} />
        <SelectField key={profile.locale} label={t("account.language")} name="locale" defaultValue={profile.locale}>
          {LOCALES.map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </SelectField>
        <CheckboxField label={t("account.analytics_consent")} name="analytics_consent" defaultChecked={profile.analytics_consent} />
        <FormMessage message={message.text} success={message.success} />
        <Button variant="primary" type="submit" disabled={saving}>{t("account.save")}</Button>
      </form>
    </Panel>
  );
}
