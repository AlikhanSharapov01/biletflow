import { Image } from "expo-image";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { EventImage } from "@/api/types";
import { Eyebrow } from "@/components/ui";
import { AnimatedPressable, usePressFeedback } from "@/components/ui/pressFeedback";
import { useEventImage } from "@/hooks/useEventImage";
import { cardShadow, colors, eventArt, fonts, radii, typography, overlays } from "@/theme";
import { useLocale } from "@/i18n";
import { t } from "@/i18n";

// Milliseconds before a touch on a card counts as a press (iOS lists wait about this long).
const CARD_PRESS_DELAY = 120;

// Discover card (web EventCard with a .live-art block): a coloured art panel
// with the category initial, then category, title, when/where and a footer
// row. The whole card opens the event. When the event has a gallery, its
// cover replaces the art once downloaded; the art stays while it loads or fails.
export function EventCard({
  index,
  category,
  title,
  meta,
  footer,
  cover,
  onPress,
}: {
  index: number;
  category: string;
  title: string;
  meta: string;
  footer?: ReactNode;
  cover?: EventImage | null;
  onPress: () => void;
}) {
  useLocale();
  const [light, dark] = eventArt[index % eventArt.length];
  const image = useEventImage(cover);
  const press = usePressFeedback();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${category}. ${meta}`}
      accessibilityHint={t("mobile.events.opens_event")}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      // A scroll that starts on the card cancels the press before it shows.
      unstable_pressDelay={CARD_PRESS_DELAY}
      style={[styles.card, press.style]}
    >
      <View style={[styles.art, { backgroundColor: light }]} accessibilityElementsHidden>
        {/* Two flat layers stand in for the web's diagonal gradient. */}
        <View style={[styles.artShade, { backgroundColor: dark }]} />
        <View style={styles.artRing}>
          <Text style={styles.artLetter}>{category.slice(0, 1)}</Text>
        </View>
        {image?.status === "ready" ? (
          <Image source={{ uri: image.uri }} style={StyleSheet.absoluteFill} contentFit="cover" testID="event-card-cover" />
        ) : null}
      </View>
      <View style={styles.copy}>
        <Eyebrow style={styles.eyebrow}>{category}</Eyebrow>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.meta}>{meta}</Text>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.panel,
    backgroundColor: colors.paper,
    ...cardShadow,
  },
  art: {
    aspectRatio: 2,
    borderTopLeftRadius: radii.panel,
    borderTopRightRadius: radii.panel,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  artShade: {
    position: "absolute",
    right: "-35%",
    bottom: "-120%",
    width: "120%",
    height: "200%",
    opacity: 0.85,
    transform: [{ rotate: "-35deg" }],
  },
  artRing: {
    width: 76,
    height: 76,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: overlays.artRing,
    borderRadius: 38,
  },
  artLetter: {
    color: overlays.artInk,
    fontFamily: fonts.sans,
    fontSize: 37,
    fontWeight: "600",
  },
  copy: {
    padding: 14,
    gap: 4,
  },
  eyebrow: {
    fontSize: 10,
  },
  title: {
    color: colors.ink,
    fontFamily: fonts.sans,
    ...typography.cardTitle,
  },
  meta: {
    color: colors.muted,
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
});
