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
import { t, useLocale } from "@/i18n";

// Suspending a user revokes every session at once; reinstating allows a
// fresh sign-in. Platform admins cannot be suspended here.
export function AdminUsersPage() {
  useLocale();
  const { notify } = useToast();
  const users = useAdminSearch(searchUsers);
  const [pending, setPending] = useState<ModerationRequest | null>(null);

  function ask(user: AdminUserRow) {
    const suspended = user.status === "suspended";
    setPending({
      title: suspended ? t("admin.reinstate_user") : t("admin.suspend_user"),
      message: suspended ? t("admin.reason_reinstate") : t("admin.reason_suspend_user"),
      confirmLabel: suspended ? t("admin.reinstate_user") : t("admin.suspend_user"),
      run: async (reason) => {
        await moderateUser(user.id, suspended ? "reinstate" : "suspend", reason);
        notify(suspended ? t("admin.user_reinstated") : t("admin.user_suspended"));
        users.reload();
      },
    });
  }

  return (
    <Panel>
      <PanelHeading title={t("admin.users")} />
      <SectionNote text={t("admin.user_search_hint")} />
      <AdminSearchForm
        placeholder="aru@example.com"
        statuses={[
          { value: "active", label: t("common.active") },
          { value: "suspended", label: t("org.suspended") },
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
                      {user.is_platform_admin ? <StatusPill label={t("nav.admin")} tone="neutral" /> : null}
                    </RowTitle>
                  }
                  meta={`${user.email} · ${user.email_verified_at ? "verified" : t("admin.not_verified")}`}
                  note={t("admin.joined", { p0: dateLabel(user.created_at), p1: user.id })}
                  trailing={
                    user.is_platform_admin ? undefined : (
                      <SubtleButton label={suspended ? t("admin.reinstate") : t("admin.suspend")} danger={!suspended} onPress={() => ask(user)} />
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
