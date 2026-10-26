import { StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "@/theme";

// The "b" tile and wordmark (web .brand / .brand-mark). `inverted` is the lime
// version used on the dark-green sign-in story.
export function Brand({ inverted = false }: { inverted?: boolean }) {
  return (
    <View style={styles.brand} accessibilityRole="header" accessibilityLabel="BiletFlow">
      <View style={[styles.mark, inverted && styles.markInverted]}>
        <Text style={[styles.markText, inverted && styles.markTextInverted]}>b</Text>
      </View>
      <Text style={[styles.word, inverted && styles.wordInverted]}>BiletFlow</Text>
    </View>
  );
}

// Initials in a sand-coloured circle (web .avatar); same initials rule as the web.
export function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  mark: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    borderBottomLeftRadius: 3,
    backgroundColor: colors.green,
  },
  markInverted: {
    backgroundColor: colors.lime,
  },
  markText: {
    color: "#fff",
    fontFamily: fonts.serif,
    fontSize: 19,
    lineHeight: 22,
  },
  markTextInverted: {
    color: colors.greenDark,
  },
  word: {
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  wordInverted: {
    color: colors.paper,
  },
  avatar: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: colors.avatar,
  },
  avatarText: {
    color: colors.avatarInk,
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: "800",
  },
});
