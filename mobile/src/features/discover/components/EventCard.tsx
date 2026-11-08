import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Eyebrow, SerifText } from "@/components/ui";
import { colors, eventArt, fonts, radii } from "@/theme";

// Discover card (web EventCard with a .live-art block): a coloured art panel
// with the category initial, then category, title, when/where and a footer
// row. The whole card opens the event.
export function EventCard({
  index,
  category,
  title,
  meta,
  footer,
  onPress,
}: {
  index: number;
  category: string;
  title: string;
  meta: string;
  footer?: ReactNode;
  onPress: () => void;
}) {
  const [light, dark] = eventArt[index % eventArt.length];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${category}. ${meta}`}
      accessibilityHint="Opens the event"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={[styles.art, { backgroundColor: light }]} accessibilityElementsHidden>
        {/* Two flat layers stand in for the web's diagonal gradient. */}
        <View style={[styles.artShade, { backgroundColor: dark }]} />
        <View style={styles.artRing}>
          <Text style={styles.artLetter}>{category.slice(0, 1)}</Text>
        </View>
      </View>
      <View style={styles.copy}>
        <Eyebrow style={styles.eyebrow}>{category}</Eyebrow>
        <SerifText style={styles.title}>{title}</SerifText>
        <Text style={styles.meta}>{meta}</Text>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.panel,
    backgroundColor: colors.paper,
  },
  pressed: {
    borderColor: "#aabaae",
  },
  art: {
    aspectRatio: 2,
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
    fontSize: 20,
    lineHeight: 25,
  },
  meta: {
    color: "#89928b",
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
