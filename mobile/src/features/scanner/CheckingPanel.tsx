import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { panelStyles } from "@/features/scanner/panelStyles";
import { colors } from "@/theme";
import { t, useLocale } from "@/i18n";

// Shown while a scanned code is being checked with the server.
export function CheckingPanel() {
  useLocale();
  return (
    <View style={[panelStyles.panel, styles.panelChecking]}>
      <ActivityIndicator color="#fff" />
      <Text style={panelStyles.panelTitle}>{t("checkout.checking")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panelChecking: {
    backgroundColor: colors.greenStory,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});
