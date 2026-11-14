import type { ReactNode } from "react";

import { EmptyState, LoadingState, PageHeading, Panel } from "@/components/ui";
import { useIsPlatformAdmin } from "@/features/admin/useIsPlatformAdmin";
import { t, useLocale } from "@/i18n";

// Shows the admin screens only to platform admins (the server checks again
// on every call); everyone else gets the web's "Admins only" message.
export function AdminGate({ children }: { children: ReactNode }) {
  useLocale();
  const { isAdmin, checking } = useIsPlatformAdmin();

  if (checking) return <LoadingState message={t("admin.checking")} />;
  if (!isAdmin) {
    return (
      <>
        <PageHeading eyebrow={t("admin.eyebrow")} title={t("admin.only")} />
        <Panel>
          <EmptyState message={t("admin.access_hint")} />
        </Panel>
      </>
    );
  }
  return <>{children}</>;
}
