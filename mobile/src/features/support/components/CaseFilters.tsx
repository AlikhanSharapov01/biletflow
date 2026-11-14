import { StyleSheet, View } from "react-native";

import { SUPPORT_CATEGORIES, SUPPORT_STATUSES, type SupportCategory, type SupportStatus } from "@/api/types/support";
import { SelectField } from "@/components/ui";

import { CATEGORY_LABELS, STATUS_LABELS } from "../utils/supportLabels";
import { t, useLocale } from "@/i18n";

interface CaseFiltersProps {
  status: SupportStatus | "";
  category: SupportCategory | "";
  onChange: (filters: { status: SupportStatus | ""; category: SupportCategory | "" }) => void;
}

const STATUS_OPTIONS = [
  { value: "", get label() { return t("support.all_statuses"); } },
  ...SUPPORT_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })),
];
const CATEGORY_OPTIONS = [
  { value: "", get label() { return t("discover.all_categories"); } },
  ...SUPPORT_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] })),
];

// Status and category filters for the case list; each change applies at once.
export function CaseFilters({ status, category, onChange }: CaseFiltersProps) {
  useLocale();
  return (
    <View style={styles.row}>
      <View style={styles.cell}>
        <SelectField
          label={t("common.status")}
          value={status}
          options={STATUS_OPTIONS}
          onChange={(value) => onChange({ status: value as SupportStatus | "", category })}
        />
      </View>
      <View style={styles.cell}>
        <SelectField
          label={t("discover.category")}
          value={category}
          options={CATEGORY_OPTIONS}
          onChange={(value) => onChange({ status, category: value as SupportCategory | "" })}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10, marginBottom: 8 },
  cell: { flex: 1 },
});
