import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, fonts, radii } from "@/theme";
import { useLocale } from "@/i18n";

// Labelled checkbox (web CheckboxField and the capability tiles).
export function CheckboxField({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  useLocale();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <View style={[styles.box, checked && styles.boxChecked]}>{checked ? <Text style={styles.tick}>✓</Text> : null}</View>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 40 },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.5 },
  box: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.inputLine,
    borderRadius: radii.input / 2,
    backgroundColor: colors.paper,
  },
  boxChecked: { borderColor: colors.green, backgroundColor: colors.green },
  tick: { color: colors.paper, fontSize: 14, fontWeight: "700" },
  copy: { flex: 1, gap: 1 },
  label: { color: colors.ink, fontFamily: fonts.sans, fontSize: 14, fontWeight: "600" },
  hint: { color: colors.muted, fontFamily: fonts.sans, fontSize: 12 },
});
