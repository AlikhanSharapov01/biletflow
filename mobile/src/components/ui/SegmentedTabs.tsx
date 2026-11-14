import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "@/theme";
import { useLocale } from "@/i18n";

export type TabItem<T extends string> = { id: T; label: string };

// A row of tabs (web .tabs). Scrolls sideways when there are more tabs than
// fit; `fill` makes equal-width segments (the sign-in switch).
export function SegmentedTabs<T extends string>({
  items,
  value,
  onChange,
  fill = false,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  fill?: boolean;
}) {
  useLocale();
  const tabs = items.map((item) => {
    const selected = item.id === value;
    return (
      <Pressable
        key={item.id}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        onPress={() => onChange(item.id)}
        style={[styles.tab, fill && styles.fill, selected && styles.active]}
      >
        <Text style={[styles.label, selected && styles.activeLabel]} numberOfLines={1}>
          {item.label}
        </Text>
      </Pressable>
    );
  });
  if (fill) {
    return (
      <View style={styles.track} accessibilityRole="tablist">
        {tabs}
      </View>
    );
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.track}
      style={styles.scroller}
      accessibilityRole="tablist"
    >
      {tabs}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroller: { flexGrow: 0, marginBottom: 16 },
  track: { flexDirection: "row", gap: 4, padding: 4, borderRadius: 8, backgroundColor: colors.tabTrack },
  tab: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6 },
  fill: { flex: 1, alignItems: "center" },
  active: { backgroundColor: colors.paper },
  label: { color: colors.muted, fontFamily: fonts.sans, fontSize: 13, fontWeight: "600" },
  activeLabel: { color: colors.ink },
});
