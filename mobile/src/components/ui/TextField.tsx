import type { ComponentProps } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { colors, fonts, radii } from "@/theme";

type Props = ComponentProps<typeof TextInput> & {
  label: string;
  // Small grey hint after the label, e.g. "Optional" (web .field small).
  hint?: string;
};

// Labelled input (web .field). `ref` passes through to the TextInput.
export function TextField({ label, hint, style, multiline, ...props }: Props) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {hint ? <Text style={styles.hint}> {hint}</Text> : null}
      </Text>
      <TextInput
        placeholderTextColor={colors.placeholder}
        multiline={multiline}
        {...props}
        style={[styles.input, multiline && styles.multiline, style]}
      />
    </View>
  );
}

export const fieldStyles = StyleSheet.create({
  label: {
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: "700",
  },
  box: {
    minHeight: 46,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: colors.inputLine,
    borderRadius: radii.input,
    backgroundColor: colors.paper,
  },
});

const styles = StyleSheet.create({
  field: {
    gap: 7,
  },
  label: fieldStyles.label,
  hint: {
    color: "#929b94",
    fontSize: 12,
    fontWeight: "400",
  },
  input: {
    ...fieldStyles.box,
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 15,
  },
  multiline: {
    minHeight: 92,
    paddingTop: 11,
    textAlignVertical: "top",
  },
});
