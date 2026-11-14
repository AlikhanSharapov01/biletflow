import { useRouter } from "expo-router";

import { ScrollScreen } from "@/components/layout";
import { ListRow, PageHeading, Panel, PanelHeading } from "@/components/ui";
import { ADMIN_SECTIONS } from "@/features/admin/adminPaths";
import { AdminGate } from "@/features/admin/components/AdminGate";
import { t, useLocale } from "@/i18n";

// Platform-admin portal: one row per section (web AdminLayout navigation).
export function AdminHomeScreen() {
  useLocale();
  const router = useRouter();
  return (
    <ScrollScreen>
      <AdminGate>
        <PageHeading
          eyebrow={t("admin.eyebrow")}
          title={t("admin.title")}
          subtitle={t("admin.subtitle")}
        />
        <Panel>
          <PanelHeading title={t("admin.sections")} />
          {ADMIN_SECTIONS.map((section) => (
            <ListRow
              key={section.id}
              icon={section.glyph}
              title={section.label}
              meta={section.meta}
              accessibilityLabel={section.label}
              onPress={() => router.push({ pathname: "/admin/[section]", params: { section: section.id } })}
            />
          ))}
        </Panel>
      </AdminGate>
    </ScrollScreen>
  );
}
