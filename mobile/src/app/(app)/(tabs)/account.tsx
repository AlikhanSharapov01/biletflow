import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { TopBar } from "@/components/TopBar";
import { Avatar, PageHeading, Panel, PanelHeading, Screen, StatusPill, SubtleButton } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { colors, fonts } from "@/theme";

// Copy follows the web Profile & sessions page (web/src/live.js loadAccount).
export default function Account() {
  const { profile, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      // No navigation call needed: signing out flips AuthContext to
      // "signedOut", and (app)/_layout's redirect takes it from there.
    } finally {
      setLoggingOut(false);
    }
  }

  const name = profile?.display_name || "BiletFlow member";

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <TopBar />
        <PageHeading
          eyebrow="Your account"
          title="Profile & sessions."
          subtitle="Review your profile and keep track of where you’re signed in."
          actions={<SubtleButton label="Sign out" onPress={handleLogout} loading={loggingOut} />}
        />
        <Panel>
          <PanelHeading
            title="Your profile"
            trailing={
              <StatusPill
                label={profile?.email_verified_at ? "Email verified" : "Email not verified"}
                tone={profile?.email_verified_at ? "positive" : "pending"}
              />
            }
          />
          <View style={styles.person}>
            <Avatar name={name} />
            <View style={styles.personCopy}>
              <Text style={styles.name}>{name}</Text>
              <Text style={styles.email}>{profile?.email}</Text>
            </View>
          </View>
        </Panel>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  person: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  personCopy: {
    flex: 1,
    gap: 3,
  },
  name: {
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 16,
    fontWeight: "700",
  },
  email: {
    color: colors.muted,
    fontFamily: fonts.sans,
    fontSize: 14,
  },
});
