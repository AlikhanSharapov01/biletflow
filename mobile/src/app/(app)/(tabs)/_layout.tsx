import { Tabs } from "expo-router";
import { StyleSheet } from "react-native";

import { TabGlyph } from "@/components/layout";
import { colors, fonts } from "@/theme";
import { t, useLocale } from "@/i18n";

// Bottom navigation, matching the web's phone tab bar (lettered glyph buttons).
// Orders, Support, Notifications and Admin are reached from Account, as the
// web reaches Account from the avatar menu.
export default function TabsLayout() {
  useLocale();
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
          title: t("nav.discover"),
          tabBarIcon: ({ color }) => <TabGlyph letter="D" color={color} />,
        }}
      />
      <Tabs.Screen
        name="tickets"
        options={{
          title: t("common.tickets"),
          tabBarIcon: ({ color }) => <TabGlyph letter="T" color={color} />,
        }}
      />
      <Tabs.Screen
        name="organizer"
        options={{
          title: t("nav.organizer"),
          tabBarIcon: ({ color }) => <TabGlyph letter="O" color={color} />,
        }}
      />
      <Tabs.Screen
        name="check-in"
        options={{
          title: t("support.check_in"),
          tabBarIcon: ({ color }) => <TabGlyph letter="C" color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t("nav.account"),
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
