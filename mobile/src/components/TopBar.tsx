import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { Avatar, Brand } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";

// Brand on the left, the signed-in user's avatar on the right (web .topbar);
// the avatar opens the Account tab.
export function TopBar() {
  const { profile } = useAuth();
  const router = useRouter();
  return (
    <View style={styles.bar}>
      <Brand />
      <Pressable
        onPress={() => router.navigate("/account")}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Account"
      >
        <Avatar name={profile?.display_name || "BiletFlow member"} />
      </Pressable>
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
});
