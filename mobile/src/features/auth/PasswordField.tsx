import { StyleSheet, Text, TextInput, View } from "react-native";

import { TextButton, fieldStyles } from "@/components/ui";
import { colors, fonts } from "@/theme";

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
  return (
    <View style={styles.passwordField}>
      <Text style={fieldStyles.label}>Password</Text>
      <View style={[fieldStyles.box, styles.passwordRow]}>
        <TextInput
          style={styles.passwordInput}
          placeholder={isNew ? "At least 12 characters" : "Enter your password"}
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
        <TextButton label={shown ? "Hide" : "Show"} onPress={onToggleShown} />
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
