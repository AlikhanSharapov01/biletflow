import type { EventSeat } from "../../../api/types/checkout";
import { seatLook, type SeatSection } from "../utils/seats";
import { SeatButton } from "./SeatButton";

interface SeatMapProps {
  sections: SeatSection[];
  selected: ReadonlySet<string>;
  priceText: (seat: EventSeat) => string;
  canSelect: (seat: EventSeat) => boolean;
  onToggle: (seat: EventSeat) => void;
}

// Sections, then rows, then seat buttons. Each row is a labelled group, so a
// screen reader announces "Row 3" before its seats.
export function SeatMap({ sections, selected, priceText, canSelect, onToggle }: SeatMapProps) {
  return (
    <div className="seat-map">
      <div className="seat-stage" aria-hidden="true">
        Stage
      </div>
      {sections.map((section) => (
        <section className="seat-section" key={section.label} aria-label={`Section ${section.label}`}>
          <h4>Section {section.label}</h4>
          {section.rows.map((row) => (
            <div className="seat-row" role="group" aria-label={`Section ${section.label}, row ${row.label}`} key={row.label}>
              <span className="seat-row-label" aria-hidden="true">
                {row.label}
              </span>
              <div className="seat-row-seats">
                {row.seats.map((seat) => (
                  <SeatButton
                    key={seat.id}
                    seat={seat}
                    look={seatLook(seat, selected)}
                    priceText={priceText(seat)}
                    selectable={canSelect(seat)}
                    onToggle={onToggle}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
