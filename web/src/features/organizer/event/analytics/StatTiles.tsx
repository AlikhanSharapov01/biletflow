import { t, useLocale } from "../../../../i18n";
import type { EventAnalytics } from "../../../../api/types/analytics";
import { priceLabel } from "../../../../utils/format";

function percent(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
}

// Headline figures: a stat tile is clearer than a chart for single numbers.
export function StatTiles({ data }: { data: EventAnalytics }) {
  useLocale();
  const tiles = [
    { label: t("org.tickets_sold"), value: String(data.inventory.sold), note: t("org.capacity_fraction", { p0: percent(data.inventory.sold, data.inventory.capacity), p1: data.inventory.capacity }) },
    { label: t("checkout.available"), value: String(data.inventory.available), note: t("org.in_holds", { p0: data.inventory.held }) },
    { label: t("org.net_revenue"), value: priceLabel(data.revenue.net_minor), note: t("org.gross_amount", { p0: priceLabel(data.revenue.gross_minor) }) },
    { label: t("org.discounts"), value: priceLabel(data.revenue.discount_minor), note: t("org.refunded_amount", { p0: priceLabel(data.revenue.refunds_minor) }) },
    { label: t("tickets.checked_in"), value: String(data.attendance.checked_in), note: t("org.admitted_fraction", { p0: percent(data.attendance.checked_in, data.attendance.issued), p1: data.attendance.issued }) },
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
