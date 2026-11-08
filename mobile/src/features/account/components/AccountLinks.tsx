import { useRouter } from "expo-router";

import { ListRow, Panel, PanelHeading } from "@/components/ui";

// Places reached from the web sidebar that have no tab of their own on the phone.
export function AccountLinks({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  return (
    <Panel>
      <PanelHeading title="More" />
      <ListRow
        icon="R"
        title="My orders"
        meta="Receipts and order status"
        onPress={() => router.push("/orders")}
        accessibilityLabel="My orders"
      />
      <ListRow
        icon="S"
        title="Support"
        meta="Ask for help with an event, order or ticket"
        onPress={() => router.push("/support")}
        accessibilityLabel="Support"
      />
      <ListRow
        icon="N"
        title="Notifications"
        meta="Updates about your tickets and cases"
        onPress={() => router.push("/notifications")}
        accessibilityLabel="Notifications"
      />
      <ListRow
        icon="D"
        title="Signed-in sessions"
        meta="Revoke a device you no longer use."
        onPress={() => router.push("/account/sessions")}
        accessibilityLabel="Signed-in sessions"
      />
      {isAdmin ? (
        <ListRow
          icon="A"
          title="Admin portal"
          meta="Platform administration"
          onPress={() => router.push("/admin")}
          accessibilityLabel="Admin portal"
        />
      ) : null}
    </Panel>
  );
}
