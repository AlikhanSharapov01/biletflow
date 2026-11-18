import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";

import type { EventView } from "@/api/types";
import { useEventImage } from "@/hooks/useEventImage";
import { colors, radii } from "@/theme";

// The gallery's first image above the event page. Nothing is shown when the
// event has no images or the image cannot be loaded: the page reads the same
// without it.
export function EventCover({ event }: { event: EventView }) {
  const cover = event.images?.[0] ?? null;
  const image = useEventImage(cover);
  if (!cover || !image || image.status === "failed") return null;
  if (image.status === "loading") return <View style={[styles.cover, styles.placeholder]} />;
  return (
    <Image
      source={{ uri: image.uri }}
      style={styles.cover}
      contentFit="cover"
      accessible={Boolean(cover.alt_text)}
      accessibilityLabel={cover.alt_text || undefined}
      testID="event-cover"
    />
  );
}

const styles = StyleSheet.create({
  cover: { width: "100%", aspectRatio: 16 / 9, borderRadius: radii.panel, marginBottom: 16 },
  placeholder: { backgroundColor: colors.lineSoft },
});
