import { t, useLocale } from "../../../../i18n";
import type { TicketType } from "../../../../api/types";
import type { SeatAvailability, VenueLayout } from "../../../../api/types/seating";
import { statusLabel } from "../../../../utils/format";
import { seatName, seatPosition } from "../../utils/seating";

interface SeatGridProps {
  layout: VenueLayout;
  seats: SeatAvailability[];
  types: TicketType[];
  selectedId: string;
  onSelect: (seatId: string) => void;
}

// Seats drawn at their layout coordinates. Each seat is a real button with a
// full spoken label, so the map works with a keyboard and a screen reader.
export function SeatGrid({ layout, seats, types, selectedId, onSelect }: SeatGridProps) {
  useLocale();
  const canvas = { width: layout.canvas_width, height: layout.canvas_height };
  const typeName = (id: string) => types.find((type) => type.id === id)?.name ?? t("org.unknown_ticket_type");

  return (
    <div className="seat-map-wrap">
      <p className="seat-stage" aria-hidden="true">{t("checkout.stage")}</p>
      <div className="seat-map" style={{ aspectRatio: `${canvas.width} / ${canvas.height}` }} role="group" aria-label={t("org.seat_map_count", { p0: seats.length })}>
        {seats.map((seat) => {
          const label = `${seatName(seat)}, ${typeName(seat.ticket_type_id)}, ${statusLabel(seat.status)}${seat.is_accessible ? t("org.accessible_suffix") : ""}`;
          return (
            <button
              key={seat.id}
              type="button"
              className={`seat seat-${seat.status} ${seat.id === selectedId ? "selected" : ""}`}
              style={seatPosition(seat, canvas)}
              aria-label={label}
              aria-pressed={seat.id === selectedId}
              title={label}
              onClick={() => onSelect(seat.id === selectedId ? "" : seat.id)}
            >
              {seat.is_accessible ? "♿" : seat.seat_label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
