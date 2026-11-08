import type { ReactNode } from "react";
import { StyleSheet, Text } from "react-native";

import { ScrollScreen } from "@/components/layout";
import { PageHeading, Panel } from "@/components/ui";
import { colors, fonts } from "@/theme";

// Shell for the screens that finish an emailed link (web TokenLayout).
export function TokenLayout({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <ScrollScreen backLabel="Sign in">
      <PageHeading eyebrow={eyebrow} title={title} subtitle={subtitle} />
      <Panel style={styles.panel}>{children}</Panel>
    </ScrollScreen>
  );
}

// Result line under a token form (web .auth-message).
export function TokenMessage({ text, success }: { text: string; success: boolean }) {
  if (!text) return null;
  return (
    <Text style={[styles.message, success && styles.success]} accessibilityLiveRegion="polite">
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 14 },
  message: { color: colors.error, fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
  success: { color: colors.green },
});
