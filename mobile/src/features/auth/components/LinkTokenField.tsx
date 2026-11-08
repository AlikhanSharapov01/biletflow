import { StyleSheet, Text, View } from "react-native";

import { TextField } from "@/components/ui";
import { colors, fonts } from "@/theme";

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
  return (
    <View style={styles.field}>
      <TextField
        label="Link from the email"
        hint="or its token"
        placeholder="Paste the link here"
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        autoCorrect={false}
        editable={editable}
      />
      {missing ? (
        <Text style={styles.warning}>
          This link is missing its token, so it cannot {action}. Copy the whole link from your email again.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  warning: { color: colors.error, fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
});
