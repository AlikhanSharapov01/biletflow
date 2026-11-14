import { StyleSheet, Text, View } from "react-native";

import type { Organization } from "@/api/types";
import { PrimaryButton, SelectField } from "@/components/ui";
import { colors, fonts } from "@/theme";
import { t, useLocale } from "@/i18n";

interface WorkspaceToolbarProps {
  organizations: Organization[];
  organization: Organization;
  isOwner: boolean;
  onSelect: (organizationId: string) => void;
  onNewEvent: () => void;
}

// Workspace switcher (or the single workspace's name) and "New event".
export function WorkspaceToolbar({ organizations, organization, isOwner, onSelect, onNewEvent }: WorkspaceToolbarProps) {
  useLocale();
  return (
    <View style={styles.toolbar}>
      {organizations.length > 1 ? (
        <SelectField
          label={t("org.workspace")}
          value={organization.id}
          options={organizations.map((org) => ({ value: org.id, label: org.name }))}
          onChange={onSelect}
        />
      ) : null}
      <View style={styles.heading}>
        {organizations.length > 1 ? null : <Text style={styles.name}>{organization.name}</Text>}
        <Text style={styles.meta}>
          {organization.contact_email} · {isOwner ? t("org.owner") : t("org.team_member")}
        </Text>
      </View>
      <PrimaryButton label={t("mobile.org.new_event")} onPress={onNewEvent} />
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: { gap: 10 },
  heading: { gap: 2 },
  name: { color: colors.ink, fontFamily: fonts.sans, fontSize: 17, fontWeight: "700" },
  meta: { color: colors.muted, fontFamily: fonts.sans, fontSize: 13 },
});
