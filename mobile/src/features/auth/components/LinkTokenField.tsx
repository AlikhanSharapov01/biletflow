import { StyleSheet, Text, View } from "react-native";

import { TextField } from "@/components/ui";
import { colors, fonts } from "@/theme";
import { t, useLocale } from "@/i18n";

// Where the person pastes the link from the email (or only its token).
export function LinkTokenField({
  value,
  onChange,
  missing,
  action,
  editable,
}: {
  value: string;
  onChange: (value: string) => void;
  missing: boolean;
  action: string;
  editable: boolean;
}) {
  useLocale();
  return (
    <View style={styles.field}>
      <TextField
        label={t("mobile.auth.link_from_email")}
        hint={t("mobile.auth.or_token")}
        placeholder={t("mobile.auth.paste_link")}
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        autoCorrect={false}
        editable={editable}
      />
      {missing ? (
        <Text style={styles.warning}>
          {t("mobile.auth.missing_token", { p0: t("auth.missing_token_start"), p1: action })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  warning: { color: colors.error, fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
});
