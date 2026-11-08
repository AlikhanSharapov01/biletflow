import { StyleSheet } from "react-native";

import { colors, radii } from "@/theme";

// Layout shared by the organizer forms and inline panels.
export const formStyles = StyleSheet.create({
  stack: { gap: 14 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  inline: {
    gap: 12,
    marginTop: 4,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radii.panel,
    backgroundColor: colors.sidebar,
  },
  group: { gap: 4 },
});
