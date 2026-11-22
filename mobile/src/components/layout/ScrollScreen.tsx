import type { ReactNode } from "react";
import { RefreshControl, ScrollView, StyleSheet } from "react-native";

import { BackHeader } from "@/components/layout/BackHeader";
import { Screen } from "@/components/layout/Screen";
import { TopBar } from "@/components/layout/TopBar";
import { colors, spacing } from "@/theme";
import { useLocale } from "@/i18n";

// A scrolling page on the canvas. Tab roots show the brand bar (`top`); pushed
// screens show "‹ Back" (`back`). Pull to refresh when `onRefresh` is given.
//
// Forms live in these screens, so the keyboard must not cover the field being
// typed in (found on an iPhone, #53): on iOS the scroll view makes room for the
// keyboard and scrolls the focused field into view (Android already resizes the
// window), and dragging the page closes the keyboard.
export function ScrollScreen({
  children,
  header = "back",
  backLabel,
  headerTrailing,
  refreshing = false,
  onRefresh,
}: {
  children: ReactNode;
  header?: "top" | "back" | "none";
  backLabel?: string;
  headerTrailing?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  useLocale();
  return (
    <Screen>
      <ScrollView
        testID="scroll-screen"
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        refreshControl={
          onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.green} /> : undefined
        }
      >
        {header === "top" ? <TopBar /> : null}
        {header === "back" ? <BackHeader label={backLabel} trailing={headerTrailing} /> : null}
        {children}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.gutter, paddingBottom: 40, gap: spacing.gap },
});
