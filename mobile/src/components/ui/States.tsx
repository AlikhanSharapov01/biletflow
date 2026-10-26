import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { SubtleButton } from "@/components/ui/Buttons";
import { Panel } from "@/components/ui/Panel";
import { colors, fonts } from "@/theme";

// Spinner with a short line of copy (web .loading-state).
export function LoadingState({ message }: { message: string }) {
  return (
    <View style={styles.loading} accessibilityRole="progressbar">
      <ActivityIndicator color={colors.green} />
      <Text style={styles.loadingText}>{message}</Text>
    </View>
  );
}

// Centred grey copy for an empty list (web .empty-state).
export function EmptyState({ message }: { message: string }) {
  return <Text style={styles.empty}>{message}</Text>;
}

// A load that failed, with a retry (web .live-error).
export function ErrorPanel({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Panel style={styles.error}>
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.errorMessage}>{message}</Text>
      {onRetry ? <SubtleButton label="Try again" onPress={onRetry} style={styles.retry} /> : null}
    </Panel>
  );
}

const styles = StyleSheet.create({
  loading: {
    minHeight: 150,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: {
    color: colors.muted,
    fontFamily: fonts.sans,
    fontSize: 14,
  },
  empty: {
    paddingVertical: 24,
    color: "#87928a",
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  error: {
    gap: 6,
  },
  errorTitle: {
    color: "#745247",
    fontFamily: fonts.sans,
    fontSize: 16,
    fontWeight: "700",
  },
  errorMessage: {
    color: "#8d7067",
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
  },
  retry: {
    alignSelf: "flex-start",
    marginTop: 8,
  },
});
