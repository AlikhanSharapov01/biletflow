import { StyleSheet, Text, View, type ColorValue } from "react-native";

import { fonts } from "@/theme";

// Lettered tab icon, matching the web's phone layout where the sidebar
// becomes a bar of glyph buttons (web .role-nav / .nav-glyph).
export function TabGlyph({ letter, color }: { letter: string; color: ColorValue }) {
  return (
    <View style={[styles.glyph, { borderColor: color }]}>
      <Text style={[styles.glyphText, { color }]}>{letter}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  glyph: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    borderBottomLeftRadius: 2,
  },
  glyphText: {
    fontFamily: fonts.serif,
    fontSize: 11,
  },
});
