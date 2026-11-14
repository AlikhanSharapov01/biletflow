import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "@/theme";
import { t, useLocale } from "@/i18n";

// "‹ Back" on stack screens (event, ticket, order, case…), with an optional
// trailing action. Falls back to Discover when there is no history, e.g. a
// screen opened from a link.
export function BackHeader({ label = t("common.back"), trailing }: { label?: string; trailing?: ReactNode }) {
  useLocale();
  const router = useRouter();
  return (
    <View style={styles.bar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={10}
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      >
        <Text style={styles.back}>‹ {label}</Text>
      </Pressable>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 36, marginBottom: 12 },
  back: { color: colors.green, fontFamily: fonts.sans, fontSize: 15, fontWeight: "700" },
});
