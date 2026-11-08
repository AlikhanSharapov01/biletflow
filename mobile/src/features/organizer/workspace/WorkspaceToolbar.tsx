import { StyleSheet, Text, View } from "react-native";

import type { Organization } from "@/api/types";
import { PrimaryButton, SelectField } from "@/components/ui";
import { colors, fonts } from "@/theme";

interface WorkspaceToolbarProps {
  organizations: Organization[];
  organization: Organization;
  isOwner: boolean;
  onSelect: (organizationId: string) => void;
  onNewEvent: () => void;
}

// Workspace switcher (or the single workspace's name) and "New event".
export function WorkspaceToolbar({ organizations, organization, isOwner, onSelect, onNewEvent }: WorkspaceToolbarProps) {
  return (
    <View style={styles.toolbar}>
      {organizations.length > 1 ? (
        <SelectField
          label="Workspace"
          value={organization.id}
          options={organizations.map((org) => ({ value: org.id, label: org.name }))}
          onChange={onSelect}
        />
      ) : null}
      <View style={styles.heading}>
        {organizations.length > 1 ? null : <Text style={styles.name}>{organization.name}</Text>}
        <Text style={styles.meta}>
          {organization.contact_email} · {isOwner ? "You own this workspace" : "You are a team member"}
        </Text>
      </View>
      <PrimaryButton label="New event" onPress={onNewEvent} />
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: { gap: 10 },
  heading: { gap: 2 },
  name: { color: colors.ink, fontFamily: fonts.sans, fontSize: 17, fontWeight: "700" },
  meta: { color: colors.muted, fontFamily: fonts.sans, fontSize: 13 },
});
