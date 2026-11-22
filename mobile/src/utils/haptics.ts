import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

// A success tap for a meaningful commit (an order or ticket purchase going through).
// Plain taps get no haptics; the scanner has its own outcome cues.
export function commitHaptic() {
  if (Platform.OS === "web") return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
