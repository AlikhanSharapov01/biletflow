import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { listAssignedEvents, type AssignedEvent } from "@/api/scanner";
import { TopBar } from "@/components/TopBar";
import {
  DateTile,
  EmptyState,
  ErrorPanel,
  LoadingState,
  PageHeading,
  Screen,
  StatusPill,
} from "@/components/ui";
import { colors, fonts, radii, type StatusTone } from "@/theme";
import { formatEventWindow } from "@/utils/eventTime";

const STATUS_ORDER: Record<AssignedEvent["time_status"], number> = {
  active: 0,
  upcoming: 1,
  completed: 2,
};

const STATUS_LABEL: Record<AssignedEvent["time_status"], string> = {
  active: "Happening now",
  upcoming: "Upcoming",
  completed: "Ended",
};

const STATUS_TONE: Record<AssignedEvent["time_status"], StatusTone> = {
  active: "positive",
  upcoming: "pending",
  completed: "neutral",
};

// Events happening now first, then upcoming, then ended ones.
function sortForScanning(events: AssignedEvent[]): AssignedEvent[] {
  return [...events].sort(
    (a, b) =>
      STATUS_ORDER[a.time_status] - STATUS_ORDER[b.time_status] ||
      a.starts_at.localeCompare(b.starts_at)
  );
}

export default function CheckIn() {
  const router = useRouter();
  const [events, setEvents] = useState<AssignedEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setEvents(null);
    try {
      setEvents(sortForScanning(await listAssignedEvents()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
      <ErrorPanel title="We couldn’t load your events." message={error} onRetry={load} />
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
        renderItem={({ item: event }) => {
          const ended = event.time_status === "completed";
          return (
            <Pressable
              style={({ pressed }) => [
                styles.card,
                pressed && styles.cardPressed,
                ended && styles.cardDisabled,
              ]}
              disabled={ended}
              onPress={() =>
                router.push({ pathname: "/events/[eventId]/scan", params: { eventId: event.id } })
              }
            >
              <DateTile at={event.starts_at} timeZone={event.time_zone} />
              <View style={styles.cardCopy}>
                <Text style={styles.title} numberOfLines={2}>
                  {event.title}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {event.venue.name}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {formatEventWindow(event.starts_at, event.ends_at, event.time_zone)}
                </Text>
                <View style={styles.pill}>
                  <StatusPill
                    label={STATUS_LABEL[event.time_status]}
                    tone={STATUS_TONE[event.time_status]}
                  />
                </View>
              </View>
            </Pressable>
          );
        }}
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
  card: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.panel,
    backgroundColor: colors.paper,
  },
  cardPressed: {
    borderColor: "#9bb9a5",
    backgroundColor: "#f0f5eb",
  },
  cardDisabled: {
    opacity: 0.55,
  },
  cardCopy: {
    flex: 1,
    gap: 3,
  },
  title: {
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 16,
    fontWeight: "700",
  },
  meta: {
    color: "#929b94",
    fontFamily: fonts.sans,
    fontSize: 13,
  },
  pill: {
    marginTop: 6,
  },
});
