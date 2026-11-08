import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { G, Line, Path, Rect, Text as SvgText } from "react-native-svg";

import type { SalesPoint, SeriesBucket } from "@/api/types/analytics";
import { ListRow, TextButton } from "@/components/ui";
import { colors, fonts } from "@/theme";
import { dateLabel, priceLabel } from "@/utils/format";

import { barPath, layoutBars, niceMax, ticks } from "../../utils/chart";

const HEIGHT = 200;
const LEFT = 32;
const BOTTOM = 24;

function bucketLabel(value: string, bucket: SeriesBucket): string {
  return bucket === "hour" ? dateLabel(value, { day: "2-digit", month: "short", hour: "2-digit" }) : dateLabel(value, { day: "2-digit", month: "short" });
}

// Tickets sold per bucket as a single-series bar chart. Tap a bar for its
// figures; the table view lists every bucket for screen readers.
export function SalesChart({ points, bucket }: { points: SalesPoint[]; bucket: SeriesBucket }) {
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const top = Math.max(0, ...points.map((point) => point.tickets));
  const max = niceMax(top);
  const bars = width > 0 ? layoutBars(points.map((point) => point.tickets), width - LEFT, HEIGHT - BOTTOM, max) : [];
  const current = active === null ? null : points[active];
  const labelEvery = Math.max(1, Math.ceil(points.length / 4));

  return (
    <View style={styles.figure}>
      <View style={styles.caption}>
        <Text style={styles.captionText}>Tickets sold per {bucket}</Text>
        <TextButton label={showTable ? "Show chart" : "Show as table"} onPress={() => setShowTable(!showTable)} />
      </View>
      {showTable ? (
        points.map((point) => (
          <ListRow key={point.bucket_start} title={bucketLabel(point.bucket_start, bucket)} meta={`${point.tickets} tickets · ${priceLabel(point.revenue_minor)}`} />
        ))
      ) : (
        <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
          <Text style={styles.tooltip} accessibilityLiveRegion="polite">
            {current ? `${bucketLabel(current.bucket_start, bucket)}: ${current.tickets} tickets · ${priceLabel(current.revenue_minor)}` : "Tap a bar for details."}
          </Text>
          {width > 0 ? (
            <Svg width={width} height={HEIGHT} accessibilityLabel={`Bar chart of tickets sold per ${bucket}, ${points.length} bars, maximum ${top}.`}>
              {ticks(max).map((tick) => {
                const y = HEIGHT - BOTTOM - (tick / max) * (HEIGHT - BOTTOM);
                return (
                  <G key={tick}>
                    <Line x1={LEFT} x2={width} y1={y} y2={y} stroke={colors.lineSoft} strokeWidth={1} />
                    <SvgText x={LEFT - 6} y={y + 4} textAnchor="end" fontSize={10} fill={colors.muted}>
                      {String(Math.round(tick))}
                    </SvgText>
                  </G>
                );
              })}
              <G x={LEFT}>
                {bars.map((bar) => {
                  const point = points[bar.index];
                  if (!point) return null;
                  return (
                    <G key={point.bucket_start} onPress={() => setActive(active === bar.index ? null : bar.index)}>
                      <Rect x={bar.x - 1} y={0} width={bar.width + 2} height={HEIGHT - BOTTOM} fill="transparent" />
                      <Path d={barPath(bar)} fill={active === bar.index ? colors.greenDark : colors.green} />
                      {bar.index % labelEvery === 0 ? (
                        <SvgText x={bar.x + bar.width / 2} y={HEIGHT - 6} textAnchor="middle" fontSize={10} fill={colors.muted}>
                          {bucketLabel(point.bucket_start, bucket)}
                        </SvgText>
                      ) : null}
                    </G>
                  );
                })}
              </G>
            </Svg>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  figure: { gap: 8 },
  caption: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  captionText: { color: colors.ink, fontFamily: fonts.sans, fontSize: 14, fontWeight: "700" },
  tooltip: { color: colors.muted, fontFamily: fonts.sans, fontSize: 12, marginBottom: 4 },
});
