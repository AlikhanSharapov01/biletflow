import { StyleSheet, Text, View } from "react-native";

import type { Profile } from "@/api/types/auth";
import { Avatar, Panel, PanelHeading, StatusPill } from "@/components/ui";
import { colors, fonts } from "@/theme";

// Name, email and verification status of the signed-in member.
export function ProfilePanel({ profile }: { profile: Profile | null }) {
  const name = profile?.display_name || "BiletFlow member";

  return (
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
  );
}

const styles = StyleSheet.create({
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
