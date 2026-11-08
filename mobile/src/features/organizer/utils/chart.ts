// Geometry for the hand-written SVG bar chart. Pure, so it can be tested
// without a browser.

export interface Bar {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  value: number;
}

// Rounds an axis maximum up to 1, 2, 2.5 or 5 times a power of ten.
export function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * power >= value) ?? 10;
  return step * power;
}

export function ticks(max: number, count = 4): number[] {
  return Array.from({ length: count + 1 }, (_, index) => (max / count) * index);
}

// Lays bars out across `width`, growing up from `height`. A 2px gap separates
// neighbours; bars never get thinner than 2px or wider than 48px.
export function layoutBars(values: number[], width: number, height: number, max: number = niceMax(Math.max(0, ...values))): Bar[] {
  if (values.length === 0) return [];
  const slot = width / values.length;
  const barWidth = Math.max(2, Math.min(48, slot - 2));
  return values.map((value, index) => {
    const barHeight = max > 0 ? (Math.max(0, value) / max) * height : 0;
    return {
      index,
      x: index * slot + (slot - barWidth) / 2,
      y: height - barHeight,
      width: barWidth,
      height: barHeight,
      value,
    };
  });
}

// SVG path for a bar with 4px rounded top corners anchored to the baseline.
export function barPath(bar: Bar, radius = 4): string {
  if (bar.height <= 0) return "";
  const r = Math.min(radius, bar.width / 2, bar.height);
  const { x, y, width: w, height: h } = bar;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
