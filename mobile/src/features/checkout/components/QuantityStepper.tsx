import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, fonts, radii } from "@/theme";
import { useLocale } from "@/i18n";
import { t } from "@/i18n";

// Minus / count / plus in place of the web's quantity <select>.
export function QuantityStepper({
  name,
  value,
  max,
  onChange,
}: {
  name: string;
  value: number;
  max: number;
  onChange: (next: number) => void;
}) {
  useLocale();
  return (
    <View style={styles.row} accessibilityLabel={t("mobile.checkout.quantity_for", { p0: name })}>
      <Step label="−" a11y={t("mobile.checkout.fewer", { p0: name })} disabled={value <= 0} onPress={() => onChange(value - 1)} />
      <Text style={styles.count} accessibilityLiveRegion="polite">
        {value}
      </Text>
      <Step label="+" a11y={t("mobile.checkout.more", { p0: name })} disabled={value >= max} onPress={() => onChange(value + 1)} />
    </View>
  );
}

function Step({ label, a11y, disabled, onPress }: { label: string; a11y: string; disabled: boolean; onPress: () => void }) {
  useLocale();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.step, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={styles.stepText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  step: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.inputLine,
    borderRadius: radii.input,
    backgroundColor: colors.paper,
  },
  pressed: { backgroundColor: colors.activeNav },
  disabled: { opacity: 0.4 },
  stepText: { color: colors.green, fontFamily: fonts.sans, fontSize: 18, fontWeight: "700" },
  count: { minWidth: 22, color: colors.ink, fontFamily: fonts.sans, fontSize: 15, fontWeight: "700", textAlign: "center" },
});
