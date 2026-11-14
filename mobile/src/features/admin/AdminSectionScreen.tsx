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
import { t, useLocale } from "@/i18n";

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
  useLocale();
  const router = useRouter();
  const { section } = useLocalSearchParams<{ section: string }>();
  const found = adminSectionFor(section);
  const Page = found ? PAGES[found.id] : null;

  return (
    <ScrollScreen backLabel={t("nav.admin")}>
      <AdminGate>
        <PageHeading eyebrow={t("admin.eyebrow")} title={found?.label ?? t("mobile.admin.section_not_found")} />
        {Page ? (
          <Page />
        ) : (
          <Panel>
            <EmptyState message={t("mobile.admin.no_section")} />
            <PrimaryButton label={t("mobile.admin.back_to_sections")} onPress={() => router.replace("/admin")} />
          </Panel>
        )}
      </AdminGate>
    </ScrollScreen>
  );
}
