import { useLocalSearchParams, useRouter } from "expo-router";

import { ScrollScreen } from "@/components/layout";
import { EmptyState, PageHeading, Panel, PrimaryButton } from "@/components/ui";
import { adminSectionFor, type AdminSectionId } from "@/features/admin/adminPaths";
import { AdminGate } from "@/features/admin/components/AdminGate";
import { AdminEventsPage } from "@/features/admin/pages/AdminEventsPage";
import { AdminExportsPage } from "@/features/admin/pages/AdminExportsPage";
import { AdminModerationPage } from "@/features/admin/pages/AdminModerationPage";
import { AdminOrdersPage } from "@/features/admin/pages/AdminOrdersPage";
import { AdminReportsPage } from "@/features/admin/pages/AdminReportsPage";
import { AdminSettingsPage } from "@/features/admin/pages/AdminSettingsPage";
import { AdminTicketsPage } from "@/features/admin/pages/AdminTicketsPage";
import { AdminUsersPage } from "@/features/admin/pages/AdminUsersPage";

const PAGES: Record<AdminSectionId, () => React.JSX.Element> = {
  users: AdminUsersPage,
  events: AdminEventsPage,
  orders: AdminOrdersPage,
  tickets: AdminTicketsPage,
  reports: AdminReportsPage,
  moderation: AdminModerationPage,
  settings: AdminSettingsPage,
  exports: AdminExportsPage,
};

// One admin section, chosen by the `section` route param.
export function AdminSectionScreen() {
  const router = useRouter();
  const { section } = useLocalSearchParams<{ section: string }>();
  const found = adminSectionFor(section);
  const Page = found ? PAGES[found.id] : null;

  return (
    <ScrollScreen backLabel="Admin">
      <AdminGate>
        <PageHeading eyebrow="Platform administration" title={found?.label ?? "Section not found"} />
        {Page ? (
          <Page />
        ) : (
          <Panel>
            <EmptyState message="There is no admin section at this address." />
            <PrimaryButton label="Back to admin sections" onPress={() => router.replace("/admin")} />
          </Panel>
        )}
      </AdminGate>
    </ScrollScreen>
  );
}
