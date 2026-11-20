import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

import type { Tone } from "@/features/scanner/outcomes";

// Haptic cue matching the outcome, so staff feel the result without looking.
// Only a real admission gets the success cue; an offline "looks valid" gets
// the warning one, because it does not let anyone in.
export function feedback(tone: Tone) {
  if (Platform.OS === "web") return;
  const type =
    tone === "admitted"
      ? Haptics.NotificationFeedbackType.Success
      : tone === "warning" || tone === "pending"
        ? Haptics.NotificationFeedbackType.Warning
        : Haptics.NotificationFeedbackType.Error;
  Haptics.notificationAsync(type).catch(() => {});
}
