import { useRouter } from "expo-router";
import { FlatList, StyleSheet, View } from "react-native";

import { Screen, TopBar } from "@/components/layout";
import { EmptyState, ErrorPanel, LoadingState, PageHeading } from "@/components/ui";
import { AssignedEventCard } from "@/features/scanner/AssignedEventCard";
import { useAssignedEvents } from "@/features/scanner/useAssignedEvents";

// The events this staff member is assigned to scan; tapping one opens the
// scanner for it.
export function CheckInScreen() {
  const router = useRouter();
  const { events, error, reload } = useAssignedEvents();

  // Copy follows the web check-in desk page (web/src/main.js staffPage).
  const header = (
    <View>
      <TopBar />
      <PageHeading
        eyebrow="Doors open, let’s make it smooth"
        title="Check-in desk"
        subtitle="Choose your event, then scan tickets at the door."
      />
    </View>
  );

  let emptyState;
  if (error) {
    emptyState = (
      <ErrorPanel title="We couldn’t load your events." message={error} onRetry={reload} />
    );
  } else if (events === null) {
    emptyState = <LoadingState message="Loading your events…" />;
  } else {
    emptyState = (
      <EmptyState message="No events are assigned to you yet. An organizer has to assign you as a scanner." />
    );
  }

  return (
    <Screen>
      <FlatList
        data={events ?? []}
        keyExtractor={(event) => event.id}
        ListHeaderComponent={header}
        ListEmptyComponent={emptyState}
        contentContainerStyle={styles.list}
        renderItem={({ item: event }) => (
          <AssignedEventCard
            event={event}
            onPress={() =>
              router.push({ pathname: "/events/[eventId]/scan", params: { eventId: event.id } })
            }
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: 16,
    paddingBottom: 32,
    gap: 10,
  },
});
