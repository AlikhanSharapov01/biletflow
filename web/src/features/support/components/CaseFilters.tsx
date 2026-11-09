import { t, useLocale } from "../../../i18n";
import { SUPPORT_CATEGORIES, SUPPORT_STATUSES, type SupportCategory, type SupportStatus } from "../../../api/types/support";
import { SelectField } from "../../../components/ui";
import { CATEGORY_LABELS, STATUS_LABELS } from "../supportLabels";

interface CaseFiltersProps {
  status: SupportStatus | "";
  category: SupportCategory | "";
  onChange: (filters: { status: SupportStatus | ""; category: SupportCategory | "" }) => void;
}

// Status and category filters for the case list; each change applies at once.
export function CaseFilters({ status, category, onChange }: CaseFiltersProps) {
  useLocale();
  return (
    <div className="support-filters">
      <SelectField
        label={t("common.status")}
        value={status}
        onChange={(event) => onChange({ status: event.target.value as SupportStatus | "", category })}
      >
        <option value="">{t("support.all_statuses")}</option>
        {SUPPORT_STATUSES.map((value) => (
          <option key={value} value={value}>
            {STATUS_LABELS[value]}
          </option>
        ))}
      </SelectField>
      <SelectField
        label={t("discover.category")}
        value={category}
        onChange={(event) => onChange({ status, category: event.target.value as SupportCategory | "" })}
      >
        <option value="">{t("discover.all_categories")}</option>
        {SUPPORT_CATEGORIES.map((value) => (
          <option key={value} value={value}>
            {CATEGORY_LABELS[value]}
          </option>
        ))}
      </SelectField>
    </div>
  );
}
