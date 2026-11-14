import { StyleSheet, Text, TextInput, View } from "react-native";

import { TextButton, fieldStyles } from "@/components/ui";
import { colors, fonts } from "@/theme";
import { t, useLocale } from "@/i18n";

// Password input with a Show / Hide toggle; register mode asks the OS for a
// new-password suggestion instead of the saved one.
export function PasswordField({
  value,
  onChangeText,
  shown,
  onToggleShown,
  isNew,
  editable,
}: {
  value: string;
  onChangeText: (value: string) => void;
  shown: boolean;
  onToggleShown: () => void;
  isNew: boolean;
  editable: boolean;
}) {
  useLocale();
  return (
    <View style={styles.passwordField}>
      <Text style={fieldStyles.label}>{t("common.password")}</Text>
      <View style={[fieldStyles.box, styles.passwordRow]}>
        <TextInput
          style={styles.passwordInput}
          placeholder={isNew ? t("auth.minimum_password") : t("auth.enter_password")}
          placeholderTextColor={colors.placeholder}
          secureTextEntry={!shown}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType={isNew ? "newPassword" : "password"}
          maxLength={128}
          value={value}
          onChangeText={onChangeText}
          editable={editable}
        />
        <TextButton label={shown ? t("mobile.auth.hide") : t("mobile.auth.show")} onPress={onToggleShown} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  passwordField: {
    gap: 7,
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  passwordInput: {
    flex: 1,
    minHeight: 44,
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 15,
  },
});
