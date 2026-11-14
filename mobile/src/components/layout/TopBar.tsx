import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { Avatar, Brand } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthContext";
import { NotificationBell } from "@/features/notifications/NotificationBell";
import { t, useLocale } from "@/i18n";

// Brand on the left; the notification bell and the signed-in user's avatar on
// the right (web .topbar). The avatar opens the Account tab.
export function TopBar() {
  useLocale();
  const { profile } = useAuth();
  const router = useRouter();
  return (
    <View style={styles.bar}>
      <Brand />
      <View style={styles.actions}>
        <NotificationBell />
        <Pressable
          onPress={() => router.navigate("/account")}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t("nav.account")}
        >
          <Avatar name={profile?.display_name || "BiletFlow member"} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 24,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
});
