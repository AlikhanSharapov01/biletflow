import { t, useLocale } from "../../../i18n";
import { useId, type KeyboardEvent } from "react";
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
  useLocale();
  const helpId = useId();
  const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLButtonElement)) return;
    const row = event.target.closest('.seat-row');
    if (!row) return;
    const buttons = [...row.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const index = buttons.indexOf(event.target);
    let next: HTMLButtonElement | undefined;
    if (event.key === 'ArrowRight') next = buttons[index + 1];
    else if (event.key === 'ArrowLeft') next = buttons[index - 1];
    else if (event.key === 'Home') next = buttons[0];
    else if (event.key === 'End') next = buttons.at(-1);
    else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const rows = [...event.currentTarget.querySelectorAll('.seat-row')];
      const target = rows[rows.indexOf(row) + (event.key === 'ArrowUp' ? -1 : 1)];
      const candidates = [...(target?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
      next = candidates[Math.min(index, candidates.length - 1)];
    } else return;
    event.preventDefault();
    next?.focus();
  };
  return (
    <div className="seat-map" onKeyDown={navigate} aria-describedby={helpId}>
      <p id={helpId} className="visually-hidden">{t("checkout.seat_help")}</p>
      <div className="seat-stage" aria-hidden="true">{t("checkout.stage")}</div>
      {sections.map((section) => (
        <section className="seat-section" key={section.label} aria-label={t("format.section", { section: section.label })}>
          <h4>{t("format.section", { section: section.label })}</h4>
          {section.rows.map((row) => (
            <div className="seat-row" role="group" aria-label={t("format.row", { section: section.label, row: row.label })} key={row.label}>
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
