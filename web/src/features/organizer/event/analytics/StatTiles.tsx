import { t, useLocale } from "../../../../i18n";
import type { EventAnalytics } from "../../../../api/types/analytics";
import { moneyLabel, percentLabel } from "../../../../utils/format";

// Headline figures: a stat tile is clearer than a chart for single numbers.
// Percentages and totals are the server's own (ANALYTICS_API.md).
export function StatTiles({ data }: { data: EventAnalytics }) {
  useLocale();
  const { inventory, revenue, attendance } = data;
  const money = (minor: number) => moneyLabel(minor, revenue.currency);
  const absent = attendance.not_checked_in_label === "absent";
  const tiles = [
    {
      label: t("org.tickets_sold"),
      value: String(inventory.sold),
      note: t("org.capacity_fraction", { p0: percentLabel(inventory.sold_percentage), p1: inventory.capacity }),
    },
    {
      label: t("checkout.available"),
      value: String(inventory.available),
      note: t("org.in_holds", { p0: inventory.held }),
    },
    {
      label: t("org.net_revenue"),
      value: money(revenue.net_minor),
      note: t("org.gross_amount", { p0: money(revenue.gross_minor) }),
    },
    {
      label: t("org.discounts"),
      value: money(revenue.discount_minor),
      note: t("org.collected_amount", { p0: money(revenue.collected_minor) }),
    },
    {
      label: t("org.refunds_and_fees"),
      value: money(revenue.refunds_minor),
      note: t("org.fees_and_pending", { p0: money(revenue.fees_minor), p1: money(revenue.pending_refunds_minor) }),
    },
    {
      label: t("tickets.checked_in"),
      value: String(attendance.checked_in),
      note: t("org.admitted_fraction", { p0: percentLabel(attendance.percentage), p1: attendance.issued }),
    },
    {
      label: absent ? t("org.absent") : t("org.not_yet_checked_in"),
      value: String(attendance.not_checked_in),
      note: absent ? t("org.absent_hint") : t("org.not_yet_hint"),
    },
  ];
  return (
    <>
      <ul className="stat-tiles">
        {tiles.map((tile) => (
          <li className="stat-tile" key={tile.label}>
            <span className="stat-label">{tile.label}</span>
            <strong className="stat-value">{tile.value}</strong>
            <span className="stat-note">{tile.note}</span>
          </li>
        ))}
      </ul>
      {inventory.refund_pending > 0 || inventory.blocked > 0 || inventory.expired_held > 0 ? (
        <p className="form-intro">
          {t("org.inventory_notes", { p0: inventory.refund_pending, p1: inventory.blocked, p2: inventory.expired_held })}
        </p>
      ) : null}
    </>
  );
}
