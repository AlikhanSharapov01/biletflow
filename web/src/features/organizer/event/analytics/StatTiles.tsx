import type { EventAnalytics } from "../../../../api/types/analytics";
import { priceLabel } from "../../../../utils/format";

function percent(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
}

// Headline figures: a stat tile is clearer than a chart for single numbers.
export function StatTiles({ data }: { data: EventAnalytics }) {
  const tiles = [
    { label: "Tickets sold", value: String(data.inventory.sold), note: `${percent(data.inventory.sold, data.inventory.capacity)} of ${data.inventory.capacity} capacity` },
    { label: "Available", value: String(data.inventory.available), note: `${data.inventory.held} in checkout holds` },
    { label: "Net revenue", value: priceLabel(data.revenue.net_minor), note: `${priceLabel(data.revenue.gross_minor)} gross` },
    { label: "Discounts", value: priceLabel(data.revenue.discount_minor), note: `${priceLabel(data.revenue.refunds_minor)} refunded` },
    { label: "Checked in", value: String(data.attendance.checked_in), note: `${percent(data.attendance.checked_in, data.attendance.issued)} of ${data.attendance.issued} issued` },
  ];
  return (
    <ul className="stat-tiles">
      {tiles.map((tile) => (
        <li className="stat-tile" key={tile.label}>
          <span className="stat-label">{tile.label}</span>
          <strong className="stat-value">{tile.value}</strong>
          <span className="stat-note">{tile.note}</span>
        </li>
      ))}
    </ul>
  );
}
