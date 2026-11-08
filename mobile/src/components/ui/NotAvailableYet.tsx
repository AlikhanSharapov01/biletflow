import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { StatusPill } from "@/components/ui/StatusPill";
import { colors, fonts, radii } from "@/theme";

// Shown where a screen is built on a planned API contract that the backend
// does not serve yet (isNotImplemented in api/errors.ts). Never sample data.
export function NotAvailableYet({ feature, children }: { feature: string; children?: ReactNode }) {
  return (
    <View style={styles.box} accessibilityRole="summary">
      <StatusPill tone="neutral" label="Not available yet" />
      <Text style={styles.title}>{feature} is coming soon.</Text>
      <Text style={styles.copy}>
        {children ??
          "This part of BiletFlow is designed and ready, and will start working once the server side is released."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: 8,
    padding: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.line,
    borderRadius: radii.panel,
    backgroundColor: colors.sidebar,
  },
  title: { color: colors.ink, fontFamily: fonts.sans, fontSize: 15, fontWeight: "700" },
  copy: { color: colors.muted, fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
});
