import { Tabs } from "expo-router";
import { StyleSheet, Text, View, type ColorValue } from "react-native";

import { colors, fonts } from "@/theme";

// Bottom navigation, matching the web's phone layout where the sidebar
// becomes a bar of lettered glyph buttons (web .role-nav / .nav-glyph).
function Glyph({ letter, color }: { letter: string; color: ColorValue }) {
  return (
    <View style={[styles.glyph, { borderColor: color }]}>
      <Text style={[styles.glyphText, { color }]}>{letter}</Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.greenDark,
        tabBarInactiveTintColor: "#6e7972",
        tabBarActiveBackgroundColor: colors.activeNav,
        tabBarLabelStyle: styles.label,
        tabBarStyle: styles.bar,
        tabBarItemStyle: styles.item,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Discover",
          tabBarIcon: ({ color }) => <Glyph letter="D" color={color} />,
        }}
      />
      <Tabs.Screen
        name="organizer"
        options={{
          title: "Organizer",
          tabBarIcon: ({ color }) => <Glyph letter="O" color={color} />,
        }}
      />
      <Tabs.Screen
        name="check-in"
        options={{
          title: "Check-in",
          tabBarIcon: ({ color }) => <Glyph letter="C" color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ color }) => <Glyph letter="A" color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.sidebar,
    borderTopColor: colors.line,
    paddingHorizontal: 6,
    paddingTop: 6,
  },
  item: {
    marginHorizontal: 2,
    borderRadius: 6,
  },
  label: {
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: "600",
  },
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
