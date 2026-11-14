import { StyleSheet, Text } from "react-native";

import { fonts, radii, statusTones } from "@/theme";
import { formatCountdown } from "@/utils/format";
import { t, useLocale } from "@/i18n";

// Time left on the ten-minute hold; turns red in the last minute.
export function HoldCountdown({ secondsLeft }: { secondsLeft: number }) {
  useLocale();
  const tone = secondsLeft < 60 ? statusTones.blocked : statusTones.positive;
  return (
    <Text
      style={[styles.countdown, { backgroundColor: tone.background, color: tone.color }]}
      accessibilityRole="timer"
      accessibilityLiveRegion="polite"
    >
      {t("checkout.held_for")} {formatCountdown(secondsLeft)}
    </Text>
  );
}

const styles = StyleSheet.create({
  countdown: {
    alignSelf: "flex-start",
    overflow: "hidden",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
});
