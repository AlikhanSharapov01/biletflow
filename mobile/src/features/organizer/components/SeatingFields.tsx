import { listLayouts } from "@/api/seating";
import type { SeatingMode } from "@/api/types";
import { SelectField } from "@/components/ui";
import { useRequest } from "@/hooks/useRequest";

import { Intro } from "./Intro";
import { t, useLocale } from "@/i18n";

interface SeatingFieldsProps {
  venueId: string;
  mode: SeatingMode;
  layoutId: string;
  onModeChange: (mode: SeatingMode) => void;
  onLayoutChange: (layoutId: string) => void;
}

const MODES = [
  { value: "general", get label() { return t("checkout.general_admission"); } },
  { value: "assigned", get label() { return t("org.assigned_seats"); } },
];

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
    <>
      <SelectField label={t("organizer.seating")} value={mode} options={MODES} onChange={(value) => onModeChange(value as SeatingMode)} />
      <SelectField
        label={t("org.seat_layout")}
        value={mode === "assigned" ? layoutId : ""}
        placeholder={mode === "assigned" ? t("org.choose_layout") : t("org.not_general")}
        options={options.map((layout) => ({ value: layout.id, label: `${layout.name} · v${layout.version}` }))}
        onChange={onLayoutChange}
        disabled={mode !== "assigned" || options.length === 0}
      />
      {hint ? <Intro>{hint}</Intro> : null}
    </>
  );
}
