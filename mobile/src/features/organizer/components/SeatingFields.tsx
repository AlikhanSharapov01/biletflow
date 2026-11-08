import { listLayouts } from "@/api/seating";
import type { SeatingMode } from "@/api/types";
import { SelectField } from "@/components/ui";
import { useRequest } from "@/hooks/useRequest";

import { Intro } from "./Intro";

interface SeatingFieldsProps {
  venueId: string;
  mode: SeatingMode;
  layoutId: string;
  onModeChange: (mode: SeatingMode) => void;
  onLayoutChange: (layoutId: string) => void;
}

const MODES = [
  { value: "general", label: "General admission" },
  { value: "assigned", label: "Assigned seats" },
];

// Seating mode plus, for assigned seating, one of the venue's predefined
// layouts (GET /venues/{id}/layouts). There is no custom layout editor.
export function SeatingFields({ venueId, mode, layoutId, onModeChange, onLayoutChange }: SeatingFieldsProps) {
  const layouts = useRequest(async () => (venueId && mode === "assigned" ? listLayouts(venueId) : []), [venueId, mode]);
  const options = layouts.data ?? [];
  const hint =
    mode !== "assigned" ? undefined
    : !venueId ? "Choose a venue first"
    : layouts.loading ? "Loading…"
    : layouts.error ? layouts.error
    : options.length === 0 ? "This venue has no seat layouts"
    : undefined;

  return (
    <>
      <SelectField label="Seating" value={mode} options={MODES} onChange={(value) => onModeChange(value as SeatingMode)} />
      <SelectField
        label="Seat layout"
        value={mode === "assigned" ? layoutId : ""}
        placeholder={mode === "assigned" ? "Choose layout" : "Not used for general admission"}
        options={options.map((layout) => ({ value: layout.id, label: `${layout.name} · v${layout.version}` }))}
        onChange={onLayoutChange}
        disabled={mode !== "assigned" || options.length === 0}
      />
      {hint ? <Intro>{hint}</Intro> : null}
    </>
  );
}
