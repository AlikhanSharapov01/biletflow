import { StyleSheet } from "react-native";

import { colors, fonts } from "@/theme";

// Shared text styles for the checkout steps (web .checkout, .form-intro, .price).
export const checkoutStyles = StyleSheet.create({
  stack: { gap: 14 },
  head: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
  heading: { color: colors.ink, fontFamily: fonts.sans, fontSize: 16, fontWeight: "700" },
  intro: { color: colors.muted, fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
  strong: { color: colors.ink, fontWeight: "700" },
  price: { color: colors.green, fontFamily: fonts.sans, fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] },
  actions: { gap: 10 },
});
