import { Pressable, StyleSheet, Text, View } from "react-native";

import type { AuthMode } from "@/features/auth/useAuthForm";
import { colors, fonts } from "@/theme";
import { t, useLocale } from "@/i18n";

// "Sign in" / "Create account" segmented switch (web .auth-tabs).
export function AuthModeTabs({
  mode,
  onChange,
}: {
  mode: AuthMode;
  onChange: (next: AuthMode) => void;
}) {
  useLocale();
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {(["login", "register"] as const).map((tab) => (
        <Pressable
          key={tab}
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === tab }}
          onPress={() => onChange(tab)}
          style={[styles.tab, mode === tab && styles.tabActive]}
        >
          <Text style={[styles.tabText, mode === tab && styles.tabTextActive]}>
            {tab === "login" ? t("auth.sign_in") : t("auth.create_account")}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: "row",
    gap: 4,
    padding: 4,
    marginBottom: 22,
    borderRadius: 9,
    backgroundColor: colors.tabTrack,
  },
  tab: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  tabActive: {
    backgroundColor: colors.paper,
    shadowColor: colors.ink,
    shadowOpacity: 0.09,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  tabText: {
    color: "#78817c",
    fontFamily: fonts.sans,
    fontSize: 14,
    fontWeight: "600",
  },
  tabTextActive: {
    color: colors.ink,
  },
});
