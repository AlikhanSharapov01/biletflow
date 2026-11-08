import { useRouter } from "expo-router";

import { ScrollScreen } from "@/components/layout";
import { ListRow, PageHeading, Panel, PanelHeading } from "@/components/ui";
import { ADMIN_SECTIONS } from "@/features/admin/adminPaths";
import { AdminGate } from "@/features/admin/components/AdminGate";

// Platform-admin portal: one row per section (web AdminLayout navigation).
export function AdminHomeScreen() {
  const router = useRouter();
  return (
    <ScrollScreen>
      <AdminGate>
        <PageHeading
          eyebrow="Platform administration"
          title="Keep BiletFlow safe."
          subtitle="Search accounts, events, orders and tickets, review reports, and change platform settings. Every decision is recorded."
        />
        <Panel>
          <PanelHeading title="Admin sections" />
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
