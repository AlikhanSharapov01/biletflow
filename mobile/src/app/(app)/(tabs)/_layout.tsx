import { Tabs } from "expo-router";
import { StyleSheet, Text } from "react-native";

import { NavIcon } from "@/components/layout/NavIcon";
import { colors, fonts, typography } from "@/theme";
import { t, useLocale } from "@/i18n";

// Bottom navigation, matching the web's phone tab bar: the same line icons, drawn in the tab colour.
// The selected tab is tinted, not boxed: its icon is filled and its label semibold.
// Orders, Support, Notifications and Admin are reached from Account, as the
// web reaches Account from the avatar menu.
export default function TabsLayout() {
  useLocale();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabel: ({ focused, color, children }) => (
          <Text style={[styles.label, focused && styles.labelSelected, { color }]}>{children}</Text>
        ),
        tabBarStyle: styles.bar,
        tabBarItemStyle: styles.item,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("nav.discover"),
          tabBarIcon: ({ color, focused }) => <NavIcon filled={focused} id="discover" color={color} />,
        }}
      />
      <Tabs.Screen
        name="tickets"
        options={{
          title: t("common.tickets"),
          tabBarIcon: ({ color, focused }) => <NavIcon filled={focused} id="tickets" color={color} />,
        }}
      />
      <Tabs.Screen
        name="organizer"
        options={{
          title: t("nav.organizer"),
          tabBarIcon: ({ color, focused }) => <NavIcon filled={focused} id="organizer" color={color} />,
        }}
      />
      <Tabs.Screen
        name="check-in"
        options={{
          title: t("support.check_in"),
          tabBarIcon: ({ color, focused }) => <NavIcon filled={focused} id="checkin" color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t("nav.account"),
          tabBarIcon: ({ color, focused }) => <NavIcon filled={focused} id="account" color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.sidebar,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 6,
    paddingTop: 6,
  },
  item: {
    marginHorizontal: 2,
    borderRadius: 6,
  },
  label: {
    fontFamily: fonts.sans,
    ...typography.micro,
    fontWeight: "500",
    textAlign: "center",
  },
  labelSelected: {
    fontWeight: "600",
  },
});
