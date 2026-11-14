import { StyleSheet, Text, View } from "react-native";

import { SubtleButton } from "@/components/ui";
import { colors, fonts } from "@/theme";

import { pageInfo } from "../utils/paging";
import { t, useLocale } from "@/i18n";

interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
  shown: number;
  onChange: (offset: number) => void;
}

// "1–50 of 230" with Previous / Next, for `{items, total, limit, offset}` lists.
export function Pagination({ total, limit, offset, shown, onChange }: PaginationProps) {
  useLocale();
  const info = pageInfo(total, limit, offset, shown);
  return (
    <View style={styles.bar}>
      <Text style={styles.count} accessibilityLiveRegion="polite">
        {info.total === 0 ? t("org.no_results") : t("org.result_range", { p0: info.from, p1: info.to, p2: info.total })}
      </Text>
      <SubtleButton label={t("common.previous")} disabled={!info.hasPrevious} onPress={() => onChange(info.previousOffset)} />
      <SubtleButton label={t("common.next")} disabled={!info.hasNext} onPress={() => onChange(info.nextOffset)} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  count: { flex: 1, color: colors.muted, fontFamily: fonts.sans, fontSize: 13 },
});
