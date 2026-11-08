import { useState } from "react";
import { View } from "react-native";

import { moderateUser, searchUsers } from "@/api/admin";
import type { AdminUserRow } from "@/api/types/admin";
import { ListRow, Panel, PanelHeading, StatusPill, SubtleButton } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { AdminSearchForm } from "@/features/admin/components/AdminSearchForm";
import { ModerationDialog, type ModerationRequest } from "@/features/admin/components/ModerationDialog";
import { RowTitle } from "@/features/admin/components/RowTitle";
import { SearchResults } from "@/features/admin/components/SearchResults";
import { SectionNote } from "@/features/admin/components/SectionNote";
import { useAdminSearch } from "@/features/admin/hooks/useAdminSearch";
import { dateLabel, initials } from "@/utils/format";

// Suspending a user revokes every session at once; reinstating allows a
// fresh sign-in. Platform admins cannot be suspended here.
export function AdminUsersPage() {
  const { notify } = useToast();
  const users = useAdminSearch(searchUsers);
  const [pending, setPending] = useState<ModerationRequest | null>(null);

  function ask(user: AdminUserRow) {
    const suspended = user.status === "suspended";
    setPending({
      title: suspended ? "Reinstate user" : "Suspend user",
      message: suspended ? "Reason for reinstating" : "Reason for suspending (signs the user out everywhere)",
      confirmLabel: suspended ? "Reinstate user" : "Suspend user",
      run: async (reason) => {
        await moderateUser(user.id, suspended ? "reinstate" : "suspend", reason);
        notify(suspended ? "User reinstated." : "User suspended and signed out.");
        users.reload();
      },
    });
  }

  return (
    <Panel>
      <PanelHeading title="Users" />
      <SectionNote text="Search by email, display name or exact account id." />
      <AdminSearchForm
        placeholder="aru@example.com"
        statuses={[
          { value: "active", label: "Active" },
          { value: "suspended", label: "Suspended" },
        ]}
        onApply={users.apply}
      />
      <SearchResults noun="users" {...users} onPage={users.setOffset}>
        {(items) => (
          <View>
            {items.map((user) => {
              const suspended = user.status === "suspended";
              return (
                <ListRow
                  key={user.id}
                  icon={initials(user.display_name || user.email)}
                  title={
                    <RowTitle text={user.display_name}>
                      <StatusPill label={user.status} tone={suspended ? "blocked" : "positive"} />
                      {user.is_platform_admin ? <StatusPill label="Admin" tone="neutral" /> : null}
                    </RowTitle>
                  }
                  meta={`${user.email} · ${user.email_verified_at ? "verified" : "not verified"}`}
                  note={`Joined ${dateLabel(user.created_at)} · ${user.id}`}
                  trailing={
                    user.is_platform_admin ? undefined : (
                      <SubtleButton label={suspended ? "Reinstate" : "Suspend"} danger={!suspended} onPress={() => ask(user)} />
                    )
                  }
                />
              );
            })}
          </View>
        )}
      </SearchResults>
      <ModerationDialog request={pending} onClose={() => setPending(null)} />
    </Panel>
  );
}
