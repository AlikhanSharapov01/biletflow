import { Tabs } from "expo-router";
import { StyleSheet } from "react-native";

import { TabGlyph } from "@/components/layout";
import { colors, fonts } from "@/theme";

// Bottom navigation, matching the web's phone layout where the sidebar
// becomes a bar of lettered glyph buttons (web .role-nav / .nav-glyph).
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
          tabBarIcon: ({ color }) => <TabGlyph letter="D" color={color} />,
        }}
      />
      <Tabs.Screen
        name="organizer"
        options={{
          title: "Organizer",
          tabBarIcon: ({ color }) => <TabGlyph letter="O" color={color} />,
        }}
      />
      <Tabs.Screen
        name="check-in"
        options={{
          title: "Check-in",
          tabBarIcon: ({ color }) => <TabGlyph letter="C" color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ color }) => <TabGlyph letter="A" color={color} />,
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
});
