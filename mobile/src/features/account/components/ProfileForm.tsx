import { useState } from "react";
import { StyleSheet, Text } from "react-native";

import { updateProfile } from "@/api/account";
import { describeError } from "@/api/errors";
import type { Locale, Profile } from "@/api/types";
import { Panel, PanelHeading, PrimaryButton, SelectField, StatusPill, TextField } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { colors, fonts } from "@/theme";
import { t, useLocale } from "@/i18n";

const LOCALES: Array<{ value: Locale; label: string }> = [
  { value: "en", label: "English" },
  { value: "kk", label: "Қазақша" },
  { value: "ru", label: "Русский" },
];

// Display name and language preference (web ProfileForm).
export function ProfileForm({ profile, onSaved }: { profile: Profile; onSaved: (profile: Profile) => void }) {
  useLocale();
  const { notify } = useToast();
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [locale, setLocale] = useState<Locale>(profile.locale);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: "", success: false });

  async function save() {
    setSaving(true);
    setMessage({ text: "", success: false });
    try {
      const updated = await updateProfile({ display_name: displayName.trim(), locale });
      onSaved(updated);
      notify(t("account.updated"));
      setMessage({ text: t("common.saved"), success: true });
    } catch (failure) {
      setMessage({ text: describeError(failure), success: false });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel style={styles.panel}>
      <PanelHeading
        title={t("account.profile")}
        trailing={
          <StatusPill
            label={profile.email_verified_at ? t("account.verified") : t("account.not_verified")}
            tone={profile.email_verified_at ? "positive" : "pending"}
          />
        }
      />
      <Text style={styles.email}>{profile.email}</Text>
      <TextField
        label={t("account.display_name")}
        value={displayName}
        onChangeText={setDisplayName}
        maxLength={100}
        autoComplete="name"
        textContentType="name"
        editable={!saving}
      />
      <SelectField
        label={t("account.language")}
        value={locale}
        options={LOCALES}
        onChange={(next) => setLocale(next as Locale)}
        disabled={saving}
      />
      {message.text ? (
        <Text style={[styles.message, message.success && styles.success]} accessibilityLiveRegion="polite">
          {message.text}
        </Text>
      ) : null}
      <PrimaryButton
        label={t("account.save")}
        onPress={() => void save()}
        disabled={!displayName.trim()}
        loading={saving}
      />
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 12 },
  email: { marginTop: -6, color: colors.muted, fontFamily: fonts.sans, fontSize: 14 },
  message: { color: colors.error, fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
  success: { color: colors.green },
});
