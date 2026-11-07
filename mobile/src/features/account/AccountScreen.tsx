import { useState } from "react";
import { ScrollView, StyleSheet } from "react-native";

import { Screen, TopBar } from "@/components/layout";
import { PageHeading, SubtleButton } from "@/components/ui";
import { ProfilePanel } from "@/features/account/ProfilePanel";
import { useAuth } from "@/features/auth/AuthContext";

// Copy follows the web Profile & sessions page (web/src/live.js loadAccount).
export function AccountScreen() {
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
        <ProfilePanel profile={profile} />
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
});
