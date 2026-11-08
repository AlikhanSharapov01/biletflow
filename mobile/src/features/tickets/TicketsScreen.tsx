import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { claimTickets, listTickets } from "@/api/tickets";
import { ScrollScreen } from "@/components/layout";
import { EmptyState, ErrorPanel, LoadingState, PageHeading, Panel, SubtleButton, TextButton } from "@/components/ui";
import { useRequest } from "@/hooks/useRequest";

import { TicketRow } from "./components/TicketRow";

// The Tickets tab: every ticket issued to this account.
export function TicketsScreen() {
  const router = useRouter();
  // Claiming first links tickets that someone else bought for this email.
  const tickets = useRequest(async () => {
    await claimTickets().catch(() => undefined);
    return listTickets();
  }, []);

  return (
    <ScrollScreen header="top" onRefresh={tickets.reload} refreshing={tickets.loading && tickets.data !== null}>
      <PageHeading
        eyebrow="Ready for the door"
        title="My tickets."
        subtitle="Tickets issued to this account. Open one to show its QR code at check-in."
        actions={
          <>
            <SubtleButton label="Orders" onPress={() => router.push("/orders")} />
            <SubtleButton label="Support" onPress={() => router.push("/support")} />
          </>
        }
      />
      {tickets.loading && !tickets.data ? <LoadingState message="Loading tickets…" /> : null}
      {tickets.error ? (
        <ErrorPanel title="We couldn’t load your tickets." message={tickets.error} onRetry={tickets.reload} />
      ) : null}
      {tickets.data ? (
        tickets.data.length === 0 ? (
          <Panel>
            <EmptyState message="No tickets yet. Find an event to register, or sign in with the email a ticket was sent to." />
            <View style={styles.center}>
              <TextButton label="Find an event →" onPress={() => router.navigate("/")} />
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
