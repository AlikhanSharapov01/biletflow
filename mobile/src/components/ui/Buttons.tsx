import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { colors, fonts, radii } from "@/theme";

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

// Solid green call to action (web .primary-button).
export function PrimaryButton({ label, onPress, disabled, loading, style }: ButtonProps) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.primary,
        pressed && styles.primaryPressed,
        inactive && styles.inactive,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={styles.primaryText}>{label}</Text>
      )}
    </Pressable>
  );
}

// Outlined secondary action (web .subtle-button); `danger` matches .danger-button.
export function SubtleButton({
  label,
  onPress,
  disabled,
  loading,
  danger,
  style,
}: ButtonProps & { danger?: boolean }) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.subtle,
        danger && styles.dangerBorder,
        pressed && styles.subtlePressed,
        inactive && styles.inactive,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.green} />
      ) : (
        <Text style={[styles.subtleText, danger && styles.dangerText]}>{label}</Text>
      )}
    </Pressable>
  );
}

// Inline green link-style action (web .text-button).
export function TextButton({ label, onPress, disabled, style }: Omit<ButtonProps, "loading">) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={[disabled && styles.inactive, style]}
    >
      <Text style={styles.textButton}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  primary: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    borderRadius: radii.input,
    backgroundColor: colors.green,
  },
  primaryPressed: {
    backgroundColor: colors.greenDark,
  },
  primaryText: {
    color: "#fff",
    fontFamily: fonts.sans,
    fontSize: 15,
    fontWeight: "700",
  },
  subtle: {
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    backgroundColor: colors.paper,
  },
  subtlePressed: {
    borderColor: "#aabaae",
  },
  subtleText: {
    color: "#4a5951",
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: "600",
  },
  dangerBorder: {
    borderColor: colors.dangerLine,
  },
  dangerText: {
    color: colors.danger,
  },
  textButton: {
    color: colors.green,
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: "700",
  },
  inactive: {
    opacity: 0.55,
  },
});
