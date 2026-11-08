import type { ReactNode } from "react";

import { EmptyState, LoadingState, PageHeading, Panel } from "@/components/ui";
import { useIsPlatformAdmin } from "@/features/admin/useIsPlatformAdmin";

// Shows the admin screens only to platform admins (the server checks again
// on every call); everyone else gets the web's "Admins only" message.
export function AdminGate({ children }: { children: ReactNode }) {
  const { isAdmin, checking } = useIsPlatformAdmin();

  if (checking) return <LoadingState message="Checking admin access…" />;
  if (!isAdmin) {
    return (
      <>
        <PageHeading eyebrow="Platform administration" title="Admins only" />
        <Panel>
          <EmptyState message="This area is for BiletFlow platform administrators. Your account does not have that role. Organizer ownership or staff access does not include it." />
        </Panel>
      </>
    );
  }
  return <>{children}</>;
}
