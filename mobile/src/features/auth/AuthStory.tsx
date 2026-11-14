import { StyleSheet, Text, View } from "react-native";

import { Brand, Eyebrow, SerifText } from "@/components/ui";
import { colors, fonts } from "@/theme";
import { t, useLocale } from "@/i18n";

// Dark-green brand header above the sign-in panel (web .auth-story).
export function AuthStory({ topInset }: { topInset: number }) {
  useLocale();
  return (
    <View style={[styles.story, { paddingTop: topInset + 22 }]}>
      <View style={styles.ring} pointerEvents="none" />
      <Brand inverted />
      <Eyebrow style={styles.storyEyebrow}>{t("auth.city_together")}</Eyebrow>
      <SerifText style={styles.storyTitle}>
        {t("auth.make_room")} <Text style={styles.storyAccent}>{t("auth.what_matters")}</Text>
      </SerifText>
      <Text style={styles.storyCopy}>
        {t("auth.story_copy")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  story: {
    overflow: "hidden",
    paddingHorizontal: 24,
    paddingBottom: 32,
    backgroundColor: colors.greenStory,
  },
  // One of the web's concentric circles (.auth-story::before).
  ring: {
    position: "absolute",
    top: 70,
    right: -150,
    width: 320,
    height: 320,
    borderWidth: 1,
    borderColor: "rgba(226,244,191,0.17)",
    borderRadius: 160,
  },
  storyEyebrow: {
    marginTop: 34,
    color: "#bbd5b3",
  },
  storyTitle: {
    marginTop: 14,
    color: colors.paper,
    fontSize: 42,
    letterSpacing: -1.5,
    lineHeight: 46,
  },
  storyAccent: {
    color: colors.lime,
  },
  storyCopy: {
    maxWidth: 350,
    marginTop: 14,
    color: "#d1ddd2",
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 22,
  },
});
