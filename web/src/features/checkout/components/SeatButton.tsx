import { t, useLocale } from "../../../i18n";
import type { EventSeat } from "../../../api/types/checkout";
import { SEAT_LOOKS, type SeatLook } from "../utils/seats";

interface SeatButtonProps {
  seat: EventSeat;
  look: SeatLook;
  // e.g. "Standard, ₸5,000.00"
  priceText: string;
  selectable: boolean;
  onToggle: (seat: EventSeat) => void;
}

export function SeatButton({ seat, look, priceText, selectable, onToggle }: SeatButtonProps) {
  useLocale();
  const label = [
    t("format.seat_accessible_label", { section: seat.section_label, row: seat.row_label, seat: seat.seat_label }),
    priceText,
    SEAT_LOOKS[look].label,
    seat.is_accessible ? t("checkout.accessible") : "",
  ]
    .filter(Boolean)
    .join(", ");
  const interactive = look === "selected" || (look === "available" && selectable);
  return (
    <button
      type="button"
      className={`seat seat-${look}${seat.is_accessible ? " seat-accessible" : ""}`}
      aria-label={label}
      aria-pressed={look === "selected" || look === "available" ? look === "selected" : undefined}
      disabled={!interactive}
      title={label}
      onClick={() => onToggle(seat)}
    >
      <span aria-hidden="true">{SEAT_LOOKS[look].glyph || (seat.is_accessible ? "♿" : seat.seat_label)}</span>
    </button>
  );
}
