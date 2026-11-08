import { useState } from "react";

import { getMyProfile, logoutEverywhere } from "@/api/account";
import { describeError } from "@/api/errors";
import { ScrollScreen } from "@/components/layout";
import { confirmAction, LoadingState, PageHeading, SubtleButton } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { AccountLinks } from "@/features/account/components/AccountLinks";
import { ProfileForm } from "@/features/account/components/ProfileForm";
import { useIsPlatformAdmin } from "@/features/admin/useIsPlatformAdmin";
import { useAuth } from "@/features/auth/AuthContext";

// Account tab: profile, links to orders / support / notifications / sessions
// (and the admin portal for platform admins), and signing out.
export function AccountScreen() {
  const { profile, logout, setProfile } = useAuth();
  const { notify } = useToast();
  const { isAdmin } = useIsPlatformAdmin();
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<"" | "one" | "all">("");

  async function refresh() {
    setRefreshing(true);
    try {
      setProfile(await getMyProfile());
    } catch (failure) {
      notify(describeError(failure));
    } finally {
      setRefreshing(false);
    }
  }

  async function signOut() {
    setBusy("one");
    try {
      await logout();
    } finally {
      setBusy("");
    }
  }

  async function signOutEverywhere() {
    const confirmed = await confirmAction({
      title: "Sign out everywhere",
      message: "Sign out of every active BiletFlow session? This device will also be signed out.",
      confirmLabel: "Sign out everywhere",
      destructive: true,
    });
    if (!confirmed) return;
    setBusy("all");
    try {
      await logoutEverywhere();
    } catch (failure) {
      notify(`Could not sign out everywhere: ${describeError(failure)}`);
      setBusy("");
      return;
    }
    await logout();
    setBusy("");
  }

  return (
    <ScrollScreen header="top" refreshing={refreshing} onRefresh={() => void refresh()}>
      <PageHeading
        eyebrow="Your account"
        title="Profile & sessions."
        subtitle="Review your profile and keep track of where you’re signed in."
        actions={
          <>
            <SubtleButton label="Sign out" onPress={() => void signOut()} loading={busy === "one"} disabled={busy !== ""} />
            <SubtleButton
              label="Sign out everywhere"
              danger
              onPress={() => void signOutEverywhere()}
              loading={busy === "all"}
              disabled={busy !== ""}
            />
          </>
        }
      />
      {profile ? (
        <ProfileForm key={profile.id} profile={profile} onSaved={setProfile} />
      ) : (
        <LoadingState message="Loading your profile…" />
      )}
      <AccountLinks isAdmin={isAdmin} />
    </ScrollScreen>
  );
}
