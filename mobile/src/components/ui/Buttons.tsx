import {
  ActivityIndicator,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { AnimatedPressable, usePressFeedback } from "@/components/ui/pressFeedback";
import { colors, fonts, radii } from "@/theme";
import { useLocale } from "@/i18n";

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

// Solid green call to action (web .primary-button).
export function PrimaryButton({ label, onPress, disabled, loading, style }: ButtonProps) {
  useLocale();
  const inactive = disabled || loading;
  const press = usePressFeedback();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={inactive}
      style={[
        styles.primary,
        press.pressed && styles.primaryPressed,
        inactive && styles.inactive,
        style,
        press.style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.onGreen} />
      ) : (
        <Text style={styles.primaryText}>{label}</Text>
      )}
    </AnimatedPressable>
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
  useLocale();
  const inactive = disabled || loading;
  const press = usePressFeedback();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={inactive}
      style={[
        styles.subtle,
        danger && styles.dangerBorder,
        press.pressed && styles.subtlePressed,
        inactive && styles.inactive,
        style,
        press.style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.green} />
      ) : (
        <Text style={[styles.subtleText, danger && styles.dangerText]}>{label}</Text>
      )}
    </AnimatedPressable>
  );
}

// Inline green link-style action (web .text-button); `light` is the lime
// version for dark-green backgrounds.
export function TextButton({
  label,
  onPress,
  disabled,
  light,
  style,
  accessibilityLabel,
}: Omit<ButtonProps, "loading"> & { light?: boolean; accessibilityLabel?: string }) {
  useLocale();
  const press = usePressFeedback();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={disabled}
      hitSlop={8}
      style={[disabled && styles.inactive, style, press.style]}
    >
      <Text style={[styles.textButton, light && styles.textButtonLight]}>{label}</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  primary: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    borderRadius: radii.button,
    backgroundColor: colors.green,
  },
  primaryPressed: {
    backgroundColor: colors.greenDark,
  },
  primaryText: {
    color: colors.onGreen,
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
    borderRadius: radii.button,
    backgroundColor: colors.paper,
  },
  subtlePressed: {
    borderColor: colors.hoverLine,
  },
  subtleText: {
    color: colors.buttonInk,
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
  textButtonLight: {
    color: colors.lime,
  },
  inactive: {
    opacity: 0.55,
  },
});
