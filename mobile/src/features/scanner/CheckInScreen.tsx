import { useRouter } from "expo-router";
import { FlatList, StyleSheet, View } from "react-native";

import { Screen, TopBar } from "@/components/layout";
import { EmptyState, ErrorPanel, LoadingState, PageHeading } from "@/components/ui";
import { AssignedEventCard } from "@/features/scanner/AssignedEventCard";
import { useAssignedEvents } from "@/features/scanner/useAssignedEvents";
import { t, useLocale } from "@/i18n";

// The events this staff member is assigned to scan; tapping one opens the
// scanner for it.
export function CheckInScreen() {
  useLocale();
  const router = useRouter();
  const { events, error, reload } = useAssignedEvents();

  // Copy follows the web check-in desk page (web/src/main.js staffPage).
  const header = (
    <View>
      <TopBar />
      <PageHeading
        eyebrow={t("mobile.scan.desk_eyebrow")}
        title={t("mobile.scan.desk_title")}
        subtitle={t("mobile.scan.desk_intro")}
      />
    </View>
  );

  let emptyState;
  if (error) {
    emptyState = (
      <ErrorPanel title={t("org.events_error")} message={error} onRetry={reload} />
    );
  } else if (events === null) {
    emptyState = <LoadingState message={t("mobile.scan.loading_events")} />;
  } else {
    emptyState = (
      <EmptyState message={t("mobile.scan.no_events")} />
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
