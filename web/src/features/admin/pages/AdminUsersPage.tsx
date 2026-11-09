import { t, useLocale } from "../../../i18n";
import { useState } from "react";
import { moderateUser, searchUsers } from "../../../api/admin";
import { Button, ListRow, Panel, PanelHeading, StatusPill, useToast } from "../../../components/ui";
import { dateLabel, initials } from "../../../utils/format";
import { AdminSearchForm } from "../components/AdminSearchForm";
import { ReasonForm } from "../components/ReasonForm";
import { SearchResults } from "../components/SearchResults";
import { useAdminSearch } from "../hooks/useAdminSearch";

// Suspending a user revokes every session at once; reinstating allows a
// fresh sign-in. Platform admins cannot be suspended here.
export function AdminUsersPage() {
  useLocale();
  const { notify } = useToast();
  const users = useAdminSearch(searchUsers);
  const [openId, setOpenId] = useState("");

  return (
    <Panel>
      <PanelHeading title={t("admin.users")} subtitle={t("admin.user_search_hint")} />
      <AdminSearchForm
        label={t("admin.user_search")}
        placeholder="aru@example.com"
        statuses={[
          { value: "active", label: t("common.active") },
          { value: "suspended", label: t("org.suspended") },
        ]}
        onApply={users.apply}
      />
      <SearchResults noun={t("word.users")} {...users} onPage={users.setOffset}>
        {(items) => (
          <div className="list">
            {items.map((user) => {
              const suspended = user.status === "suspended";
              const action = suspended ? "reinstate" : "suspend";
              return (
                <ListRow
                  key={user.id}
                  icon={initials(user.display_name || user.email)}
                  title={
                    <>
                      {user.display_name}
                      <StatusPill tone={suspended ? "blocked" : "positive"}>{user.status}</StatusPill>
                      {user.is_platform_admin ? <StatusPill tone="neutral">{t("nav.admin")}</StatusPill> : null}
                    </>
                  }
                  meta={`${user.email} · ${user.email_verified_at ? "verified" : t("admin.not_verified")}`}
                  note={t("admin.joined", { p0: dateLabel(user.created_at), p1: user.id })}
                  actions={
                    user.is_platform_admin ? null : (
                      <Button size="sm" variant={suspended ? "subtle" : "danger"} onClick={() => setOpenId(openId === user.id ? "" : user.id)}>
                        {openId === user.id ? t("common.close") : suspended ? t("admin.reinstate") : t("admin.suspend")}
                      </Button>
                    )
                  }
                >
                  {openId === user.id ? (
                    <ReasonForm
                      label={suspended ? t("admin.reason_reinstate") : t("admin.reason_suspend_user")}
                      submitLabel={suspended ? t("admin.reinstate_user") : t("admin.suspend_user")}
                      danger={!suspended}
                      onCancel={() => setOpenId("")}
                      onSubmit={async (reason) => {
                        await moderateUser(user.id, action, reason);
                        notify(suspended ? t("admin.user_reinstated") : t("admin.user_suspended"));
                        setOpenId("");
                        users.reload();
                      }}
                    />
                  ) : null}
                </ListRow>
              );
            })}
          </div>
        )}
      </SearchResults>
    </Panel>
  );
}
