import { dayNumber, monthShort } from "../../utils/format";

// Sand-coloured day/month block at the start of an event card. Decorative:
// the full date is always repeated in the card's text.
export function DateTile({ at }: { at: string | null }) {
  return (
    <span className="date-tile" aria-hidden="true">
      <b>{at ? dayNumber(at) : "—"}</b>
      <span>{at ? monthShort(at) : ""}</span>
    </span>
  );
}
