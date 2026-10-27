import { useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { fieldStyles } from "@/components/ui/TextField";
import { colors, fonts } from "@/theme";

export type SelectOption = {
  value: string;
  label: string;
};

// Stand-in for the web's <select> fields: shows the chosen option in a field
// box and opens a sheet listing the options.
export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder = "Choose…",
  disabled,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <View style={styles.field}>
      <Text style={fieldStyles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? placeholder}`}
        onPress={() => setOpen(true)}
        disabled={disabled}
        style={[fieldStyles.box, styles.box, disabled && styles.disabled]}
      >
        <Text style={[styles.value, !selected && styles.placeholder]} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <SafeAreaView edges={["bottom"]} style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={8}>
              <Text style={styles.done}>Done</Text>
            </Pressable>
          </View>
          <FlatList
            data={options}
            keyExtractor={(option) => option.value || "__empty"}
            renderItem={({ item }) => {
              const active = item.value === value;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[styles.option, active && styles.optionActive]}
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                >
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>
                    {item.label}
                  </Text>
                  {active ? <Text style={styles.check}>✓</Text> : null}
                </Pressable>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 7,
  },
  box: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  value: {
    flex: 1,
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 15,
  },
  placeholder: {
    color: colors.placeholder,
  },
  chevron: {
    color: colors.muted,
    fontSize: 13,
  },
  disabled: {
    opacity: 0.55,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(23,39,36,0.35)",
  },
  sheet: {
    maxHeight: "60%",
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    backgroundColor: colors.paper,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  sheetTitle: {
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 16,
    fontWeight: "700",
  },
  done: {
    color: colors.green,
    fontFamily: fonts.sans,
    fontSize: 15,
    fontWeight: "700",
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 50,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  optionActive: {
    backgroundColor: colors.activeNav,
  },
  optionText: {
    flex: 1,
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 15,
  },
  optionTextActive: {
    color: colors.greenDark,
    fontWeight: "700",
  },
  check: {
    color: colors.green,
    fontSize: 16,
    fontWeight: "700",
  },
});
