import { StyleSheet, Text, View } from "react-native";

import { SubtleButton } from "@/components/ui";
import { colors, fonts } from "@/theme";
import { t, useLocale } from "@/i18n";

// "1–25 of 230" with Previous / Next for `{items, total, limit, offset}` lists.
export function Pagination({
  total,
  limit,
  offset,
  shown,
  onChange,
}: {
  total: number;
  limit: number;
  offset: number;
  shown: number;
  onChange: (offset: number) => void;
}) {
  useLocale();
  const from = total === 0 ? 0 : offset + 1;
  const to = offset + shown;
  const hasPrevious = offset > 0;
  const hasNext = offset + shown < total;
  return (
    <View style={styles.bar}>
      <Text style={styles.count} accessibilityLiveRegion="polite">
        {total === 0 ? t("org.no_results") : t("org.result_range", { p0: from, p1: to, p2: total })}
      </Text>
      <SubtleButton label={t("common.previous")} disabled={!hasPrevious} onPress={() => onChange(Math.max(0, offset - limit))} />
      <SubtleButton label={t("common.next")} disabled={!hasNext} onPress={() => onChange(offset + limit)} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  count: { flex: 1, color: colors.muted, fontFamily: fonts.sans, fontSize: 13 },
});
