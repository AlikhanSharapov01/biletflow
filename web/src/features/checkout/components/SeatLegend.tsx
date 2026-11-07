import { SEAT_LOOKS, type SeatLook } from "../utils/seats";

const SHOWN: SeatLook[] = ["available", "selected", "held", "sold", "unavailable"];

// Colour plus a glyph for every state, so the map never relies on colour alone.
export function SeatLegend() {
  return (
    <ul className="seat-legend" aria-label="Seat map legend">
      {SHOWN.map((look) => (
        <li key={look}>
          <span className={`seat-swatch seat-${look}`} aria-hidden="true">
            {SEAT_LOOKS[look].glyph}
          </span>
          {SEAT_LOOKS[look].label}
        </li>
      ))}
      <li>
        <span className="seat-swatch seat-available seat-accessible" aria-hidden="true">
          ♿
        </span>
        Wheelchair accessible
      </li>
    </ul>
  );
}
