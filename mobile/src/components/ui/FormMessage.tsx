import { StyleSheet, Text } from "react-native";

import { colors, fonts, statusTones } from "@/theme";

// Inline result of a form action (web FormMessage): red for a failure,
// green for a success, nothing when there is no message.
export function FormMessage({ message, success = false }: { message: string; success?: boolean }) {
  if (!message) return null;
  return (
    <Text
      accessibilityRole={success ? "text" : "alert"}
      accessibilityLiveRegion="polite"
      style={[styles.message, success ? styles.success : styles.failure]}
    >
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  message: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  failure: { color: colors.error },
  success: { color: statusTones.positive.color },
});
