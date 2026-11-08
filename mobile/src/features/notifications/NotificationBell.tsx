import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import Svg, { Path } from "react-native-svg";

import { unreadNotificationCount } from "@/api/notifications";
import { colors, fonts } from "@/theme";

import { useAppActive } from "@/hooks/useAppActive";
import { subscribeNotificationsChanged, unreadBadgeLabel } from "./notificationTarget";

const REFRESH_MS = 60_000;

// Bell with the unread count for the top bar. Refreshed every minute while the
// app is in the foreground, on returning to it, and when the inbox marks items
// read. Render it only for signed-in users.
export function NotificationBell() {
  const router = useRouter();
  const appActive = useAppActive();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!appActive) return;
    let active = true;
    const load = () => {
      unreadNotificationCount()
        .then((count) => {
          if (active) setUnread(count);
        })
        .catch(() => undefined);
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    const unsubscribe = subscribeNotificationsChanged(load);
    return () => {
      active = false;
      clearInterval(timer);
      unsubscribe();
    };
  }, [appActive]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
      hitSlop={8}
      onPress={() => router.push("/notifications")}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </Svg>
      {unread > 0 ? (
        <Text style={styles.badge} importantForAccessibility="no" accessibilityElementsHidden>
          {unreadBadgeLabel(unread)}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.6 },
  badge: {
    position: "absolute",
    top: 2,
    right: 0,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    overflow: "hidden",
    backgroundColor: colors.coral,
    color: "#fff",
    fontFamily: fonts.sans,
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 18,
    textAlign: "center",
  },
});
