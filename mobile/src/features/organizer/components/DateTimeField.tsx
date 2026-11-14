import { TextField } from "@/components/ui";

import { DATE_HINT, DATE_TIME_HINT } from "../utils/dateInput";
import { useLocale } from "@/i18n";
import { t } from "@/i18n";

// Stand-in for <input type="datetime-local"> (or type="date" with `dateOnly`).
export function DateTimeField({
  label,
  value,
  onChange,
  disabled,
  dateOnly = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  dateOnly?: boolean;
}) {
  useLocale();
  const hint = dateOnly ? DATE_HINT : DATE_TIME_HINT;
  return (
    <TextField
      label={label}
      hint={hint}
      value={value}
      onChangeText={onChange}
      placeholder={hint}
      editable={!disabled}
      autoCapitalize="none"
      autoCorrect={false}
      keyboardType="numbers-and-punctuation"
      maxLength={dateOnly ? 10 : 16}
      accessibilityLabel={t("mobile.ui.field_format", { p0: label, p1: hint })}
    />
  );
}
