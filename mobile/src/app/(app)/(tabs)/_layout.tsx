import { Tabs } from "expo-router";
import { StyleSheet } from "react-native";

import { NavIcon } from "@/components/layout/NavIcon";
import { colors, fonts } from "@/theme";
import { t, useLocale } from "@/i18n";

// Bottom navigation, matching the web's phone tab bar: the same line icons, drawn in the tab colour.
// Orders, Support, Notifications and Admin are reached from Account, as the
// web reaches Account from the avatar menu.
export default function TabsLayout() {
  useLocale();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.greenDark,
        tabBarInactiveTintColor: colors.muted,
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
          tabBarIcon: ({ color }) => <NavIcon id="discover" color={color} />,
        }}
      />
      <Tabs.Screen
        name="tickets"
        options={{
          title: t("common.tickets"),
          tabBarIcon: ({ color }) => <NavIcon id="tickets" color={color} />,
        }}
      />
      <Tabs.Screen
        name="organizer"
        options={{
          title: t("nav.organizer"),
          tabBarIcon: ({ color }) => <NavIcon id="organizer" color={color} />,
        }}
      />
      <Tabs.Screen
        name="check-in"
        options={{
          title: t("support.check_in"),
          tabBarIcon: ({ color }) => <NavIcon id="checkin" color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t("nav.account"),
          tabBarIcon: ({ color }) => <NavIcon id="account" color={color} />,
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
