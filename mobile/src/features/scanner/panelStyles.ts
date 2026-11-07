import { StyleSheet } from "react-native";

import { fonts } from "@/theme";

// Shared look of the panels that sit over the bottom of the camera: full
// width, white text on a strong colour so the outcome reads from a distance.
export const panelStyles = StyleSheet.create({
  panel: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 16,
    borderRadius: 16,
    padding: 20,
    gap: 6,
  },
  panelTitle: {
    color: "#fff",
    fontFamily: fonts.serif,
    fontSize: 26,
  },
  panelLine: {
    color: "#fff",
    fontFamily: fonts.sans,
    fontSize: 16,
  },
  panelActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 10,
  },
  panelButton: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  panelButtonSecondary: {
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  panelButtonDisabled: {
    opacity: 0.5,
  },
  panelButtonText: {
    color: "#fff",
    fontFamily: fonts.sans,
    fontSize: 16,
    fontWeight: "600",
  },
});
