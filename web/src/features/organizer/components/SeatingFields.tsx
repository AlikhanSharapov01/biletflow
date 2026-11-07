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
    <div className="form-grid">
      <SelectField label="Seating" value={mode} onChange={(e) => onModeChange(e.target.value as SeatingMode)}>
        <option value="general">General admission</option>
        <option value="assigned">Assigned seats</option>
      </SelectField>
      <SelectField
        label="Seat layout"
        hint={hint}
        value={mode === "assigned" ? layoutId : ""}
        onChange={(e) => onLayoutChange(e.target.value)}
        disabled={mode !== "assigned" || options.length === 0}
        required={mode === "assigned"}
      >
        <option value="">{mode === "assigned" ? "Choose layout" : "Not used for general admission"}</option>
        {options.map((layout) => (
          <option key={layout.id} value={layout.id}>
            {layout.name} · v{layout.version}
          </option>
        ))}
      </SelectField>
    </div>
  );
}
