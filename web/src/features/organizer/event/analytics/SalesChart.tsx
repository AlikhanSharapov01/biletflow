import { t, useLocale } from "../../../../i18n";
import { useState } from "react";
import type { SalesPoint, SeriesBucket } from "../../../../api/types/analytics";
import { Button } from "../../../../components/ui";
import { dateLabel, priceLabel } from "../../../../utils/format";
import { barPath, layoutBars, niceMax, ticks } from "../../utils/chart";

const WIDTH = 640;
const HEIGHT = 200;
const LEFT = 36;
const BOTTOM = 24;

interface SalesChartProps {
  points: SalesPoint[];
  bucket: SeriesBucket;
}

function bucketLabel(value: string, bucket: SeriesBucket): string {
  return bucket === "hour" ? dateLabel(value, { day: "2-digit", month: "short", hour: "2-digit" }) : dateLabel(value, { day: "2-digit", month: "short" });
}

// Tickets sold per bucket as a single-series bar chart, with a focusable
// tooltip per bar and a table view for screen readers and printing.
export function SalesChart({ points, bucket }: SalesChartProps) {
  useLocale();
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const max = niceMax(Math.max(0, ...points.map((point) => point.tickets)));
  const bars = layoutBars(points.map((point) => point.tickets), WIDTH - LEFT, HEIGHT - BOTTOM, max);
  const current = active === null ? null : points[active];
  const labelEvery = Math.max(1, Math.ceil(points.length / 8));
  const period = t(bucket === "hour" ? "period.hour" : "period.day");

  return (
    <figure className="sales-chart">
      <figcaption className="sales-chart-caption">
        <span>{t("org.sold_per")}{" "}{period}</span>
        <Button size="sm" variant="text" onClick={() => setShowTable(!showTable)} aria-expanded={showTable}>
          {showTable ? t("org.show_chart") : t("org.show_table")}
        </Button>
      </figcaption>
      {showTable ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">{bucket === "hour" ? t("org.hour") : t("org.day")}</th>
                <th scope="col">{t("common.tickets")}</th>
                <th scope="col">{t("org.revenue")}</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.bucket_start}>
                  <td>{bucketLabel(point.bucket_start, bucket)}</td>
                  <td>{point.tickets}</td>
                  <td>{priceLabel(point.revenue_minor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="sales-chart-plot">
          <p className="chart-tooltip" aria-live="polite">
            {current ? t("org.chart_tooltip", { p0: bucketLabel(current.bucket_start, bucket), p1: current.tickets, p2: priceLabel(current.revenue_minor) }) : t("org.chart_hint")}
          </p>
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={t("org.chart_alt", { p0: period, p1: points.length, p2: Math.max(0, ...points.map((p) => p.tickets)) })}>
            {ticks(max).map((tick) => {
              const y = HEIGHT - BOTTOM - (tick / max) * (HEIGHT - BOTTOM);
              return (
                <g key={tick} className="chart-grid">
                  <line x1={LEFT} x2={WIDTH} y1={y} y2={y} />
                  <text x={LEFT - 6} y={y + 4} textAnchor="end">
                    {Math.round(tick)}
                  </text>
                </g>
              );
            })}
            <g transform={`translate(${LEFT} 0)`}>
              {bars.map((bar) => {
                const point = points[bar.index];
                if (!point) return null;
                return (
                  <g
                    key={point.bucket_start}
                    className={`chart-bar ${active === bar.index ? "active" : ""}`}
                    tabIndex={0}
                    role="img"
                    aria-label={t("org.chart_bar_label", { p0: bucketLabel(point.bucket_start, bucket), p1: point.tickets })}
                    onMouseEnter={() => setActive(bar.index)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(bar.index)}
                    onBlur={() => setActive(null)}
                  >
                    <rect className="chart-hit" x={bar.x - 1} y={0} width={bar.width + 2} height={HEIGHT - BOTTOM} />
                    <path d={barPath(bar)} />
                    {bar.index % labelEvery === 0 ? (
                      <text className="chart-axis-label" x={bar.x + bar.width / 2} y={HEIGHT - 6} textAnchor="middle">
                        {bucketLabel(point.bucket_start, bucket)}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      )}
    </figure>
  );
}
