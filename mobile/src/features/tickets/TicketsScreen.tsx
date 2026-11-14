import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { claimTickets, listTickets } from "@/api/tickets";
import { ScrollScreen } from "@/components/layout";
import { EmptyState, ErrorPanel, LoadingState, PageHeading, Panel, SubtleButton, TextButton } from "@/components/ui";
import { useRequest } from "@/hooks/useRequest";

import { TicketRow } from "./components/TicketRow";
import { t, useLocale } from "@/i18n";

// The Tickets tab: every ticket issued to this account.
export function TicketsScreen() {
  useLocale();
  const router = useRouter();
  // Claiming first links tickets that someone else bought for this email.
  const tickets = useRequest(async () => {
    await claimTickets().catch(() => undefined);
    return listTickets();
  }, []);

  return (
    <ScrollScreen header="top" onRefresh={tickets.reload} refreshing={tickets.loading && tickets.data !== null}>
      <PageHeading
        eyebrow={t("tickets.ready_for_door")}
        title={t("tickets.title")}
        subtitle={t("tickets.subtitle")}
        actions={
          <>
            <SubtleButton label={t("common.orders")} onPress={() => router.push("/orders")} />
            <SubtleButton label={t("nav.support")} onPress={() => router.push("/support")} />
          </>
        }
      />
      {tickets.loading && !tickets.data ? <LoadingState message={t("tickets.loading")} /> : null}
      {tickets.error ? (
        <ErrorPanel title={t("tickets.load_error")} message={tickets.error} onRetry={tickets.reload} />
      ) : null}
      {tickets.data ? (
        tickets.data.length === 0 ? (
          <Panel>
            <EmptyState message={t("mobile.tickets.empty")} />
            <View style={styles.center}>
              <TextButton label={t("mobile.orders.find_event")} onPress={() => router.navigate("/")} />
            </View>
          </Panel>
        ) : (
          <Panel>
            {tickets.data.map((ticket) => (
              <TicketRow
                key={ticket.id}
                ticket={ticket}
                onOpen={(ticketId) => router.push({ pathname: "/tickets/[ticketId]", params: { ticketId } })}
              />
            ))}
          </Panel>
        )
      ) : null}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", paddingBottom: 8 },
});
