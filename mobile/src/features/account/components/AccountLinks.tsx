import { useRouter } from "expo-router";

import { ListRow, Panel, PanelHeading } from "@/components/ui";
import { t, useLocale } from "@/i18n";

// Places reached from the web sidebar that have no tab of their own on the phone.
export function AccountLinks({ isAdmin }: { isAdmin: boolean }) {
  useLocale();
  const router = useRouter();
  return (
    <Panel>
      <PanelHeading title={t("mobile.account.more")} />
      <ListRow
        icon="R"
        title={t("mobile.account.my_orders")}
        meta={t("mobile.account.orders_hint")}
        onPress={() => router.push("/orders")}
        accessibilityLabel={t("mobile.account.my_orders")}
      />
      <ListRow
        icon="S"
        title={t("nav.support")}
        meta={t("mobile.account.support_hint")}
        onPress={() => router.push("/support")}
        accessibilityLabel={t("nav.support")}
      />
      <ListRow
        icon="N"
        title={t("nav.notifications")}
        meta={t("mobile.account.notifications_hint")}
        onPress={() => router.push("/notifications")}
        accessibilityLabel={t("nav.notifications")}
      />
      <ListRow
        icon="D"
        title={t("account.sessions")}
        meta={t("account.revoke_device")}
        onPress={() => router.push("/account/sessions")}
        accessibilityLabel={t("account.sessions")}
      />
      {isAdmin ? (
        <ListRow
          icon="A"
          title={t("mobile.account.admin_portal")}
          meta={t("admin.eyebrow")}
          onPress={() => router.push("/admin")}
          accessibilityLabel={t("mobile.account.admin_portal")}
        />
      ) : null}
    </Panel>
  );
}
