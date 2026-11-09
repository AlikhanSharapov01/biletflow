import { t, useLocale } from "../../../i18n";
import { listLayouts } from "../../../api/seating";
import type { SeatingMode } from "../../../api/types";
import { SelectField } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";

interface SeatingFieldsProps {
  venueId: string;
  mode: SeatingMode;
  layoutId: string;
  onModeChange: (mode: SeatingMode) => void;
  onLayoutChange: (layoutId: string) => void;
}

// Seating mode plus, for assigned seating, one of the venue's predefined
// layouts (GET /venues/{id}/layouts). There is no custom layout editor.
export function SeatingFields({ venueId, mode, layoutId, onModeChange, onLayoutChange }: SeatingFieldsProps) {
  useLocale();
  const layouts = useRequest(async () => (venueId && mode === "assigned" ? listLayouts(venueId) : []), [venueId, mode]);
  const options = layouts.data ?? [];
  const hint =
    mode !== "assigned" ? undefined
    : !venueId ? t("org.choose_venue_first")
    : layouts.loading ? t("common.loading")
    : layouts.error ? layouts.error
    : options.length === 0 ? t("org.no_layouts")
    : undefined;

  return (
    <div className="form-grid">
      <SelectField label={t("organizer.seating")} value={mode} onChange={(e) => onModeChange(e.target.value as SeatingMode)}>
        <option value="general">{t("checkout.general_admission")}</option>
        <option value="assigned">{t("org.assigned_seats")}</option>
      </SelectField>
      <SelectField
        label={t("org.seat_layout")}
        hint={hint}
        value={mode === "assigned" ? layoutId : ""}
        onChange={(e) => onLayoutChange(e.target.value)}
        disabled={mode !== "assigned" || options.length === 0}
        required={mode === "assigned"}
      >
        <option value="">{mode === "assigned" ? t("org.choose_layout") : t("org.not_general")}</option>
        {options.map((layout) => (
          <option key={layout.id} value={layout.id}>
            {layout.name}{" "}{t("word.version_suffix")}{layout.version}
          </option>
        ))}
      </SelectField>
    </div>
  );
}
