import { Image } from "expo-image";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { EventImage } from "@/api/types";
import { Eyebrow } from "@/components/ui";
import { AnimatedPressable, usePressFeedback } from "@/components/ui/pressFeedback";
import { useEventImage } from "@/hooks/useEventImage";
import { cardShadow, colors, eventArt, fonts, radii, typography } from "@/theme";
import { useLocale } from "@/i18n";
import { t } from "@/i18n";

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
    borderColor: "rgba(255,255,255,0.65)",
    borderRadius: 38,
  },
  artLetter: {
    color: "rgba(255,255,255,0.85)",
    fontFamily: fonts.serif,
    fontSize: 37,
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
