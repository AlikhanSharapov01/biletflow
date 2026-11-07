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
  const { notify } = useToast();
  const users = useAdminSearch(searchUsers);
  const [openId, setOpenId] = useState("");

  return (
    <Panel>
      <PanelHeading title="Users" subtitle="Search by email, display name or exact account id." />
      <AdminSearchForm
        label="User search"
        placeholder="aru@example.com"
        statuses={[
          { value: "active", label: "Active" },
          { value: "suspended", label: "Suspended" },
        ]}
        onApply={users.apply}
      />
      <SearchResults noun="users" {...users} onPage={users.setOffset}>
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
                      {user.is_platform_admin ? <StatusPill tone="neutral">Admin</StatusPill> : null}
                    </>
                  }
                  meta={`${user.email} · ${user.email_verified_at ? "verified" : "not verified"}`}
                  note={`Joined ${dateLabel(user.created_at)} · ${user.id}`}
                  actions={
                    user.is_platform_admin ? null : (
                      <Button size="sm" variant={suspended ? "subtle" : "danger"} onClick={() => setOpenId(openId === user.id ? "" : user.id)}>
                        {openId === user.id ? "Close" : suspended ? "Reinstate" : "Suspend"}
                      </Button>
                    )
                  }
                >
                  {openId === user.id ? (
                    <ReasonForm
                      label={suspended ? "Reason for reinstating" : "Reason for suspending (signs the user out everywhere)"}
                      submitLabel={suspended ? "Reinstate user" : "Suspend user"}
                      danger={!suspended}
                      onCancel={() => setOpenId("")}
                      onSubmit={async (reason) => {
                        await moderateUser(user.id, action, reason);
                        notify(suspended ? "User reinstated." : "User suspended and signed out.");
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
