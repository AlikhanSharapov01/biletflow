import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { listAssignedEvents, USE_SCANNER_MOCKS, type AssignedEvent } from "@/api/scanner";
import { useAuth } from "@/context/AuthContext";
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

// Events happening now first, then upcoming, then ended ones.
function sortForScanning(events: AssignedEvent[]): AssignedEvent[] {
  return [...events].sort(
    (a, b) =>
      STATUS_ORDER[a.time_status] - STATUS_ORDER[b.time_status] ||
      a.starts_at.localeCompare(b.starts_at)
  );
}

export default function SelectEvent() {
  const { profile, logout } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<AssignedEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

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

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      // No navigation call needed: signing out flips AuthContext to
      // "signedOut", and (app)/_layout's redirect takes it from there.
    } finally {
      setLoggingOut(false);
    }
  }

  const header = (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <Text style={styles.signedInAs} numberOfLines={1}>
          Signed in as {profile?.display_name}
        </Text>
        <Pressable onPress={handleLogout} disabled={loggingOut} hitSlop={8}>
          {loggingOut ? (
            <ActivityIndicator />
          ) : (
            <Text style={styles.logout}>Log out</Text>
          )}
        </Pressable>
      </View>
      {USE_SCANNER_MOCKS ? (
        <Text style={styles.demoBanner}>
          Demo data: the scanner service isn&apos;t live yet.
        </Text>
      ) : null}
      <Text style={styles.heading}>Choose an event to scan</Text>
    </View>
  );

  let emptyState;
  if (error) {
    emptyState = (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
        <Pressable style={styles.retry} onPress={load}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  } else if (events === null) {
    emptyState = (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  } else {
    emptyState = (
      <View style={styles.centered}>
        <Text style={styles.muted}>
          No events are assigned to you yet. An organizer has to assign you as a scanner.
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
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
              style={[styles.card, ended && styles.cardDisabled]}
              disabled={ended}
              onPress={() =>
                router.push({ pathname: "/events/[eventId]/scan", params: { eventId: event.id } })
              }
            >
              <View style={styles.cardTop}>
                <Text style={styles.title} numberOfLines={2}>
                  {event.title}
                </Text>
                <Text style={[styles.status, styles[`status_${event.time_status}`]]}>
                  {STATUS_LABEL[event.time_status]}
                </Text>
              </View>
              <Text style={styles.muted}>{event.venue.name}</Text>
              <Text style={styles.muted}>
                {formatEventWindow(event.starts_at, event.ends_at, event.time_zone)}
              </Text>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  list: {
    padding: 16,
    gap: 12,
  },
  header: {
    gap: 8,
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  signedInAs: {
    flex: 1,
    fontSize: 14,
    color: "#666",
  },
  logout: {
    fontSize: 14,
    fontWeight: "600",
    color: "#208AEF",
  },
  demoBanner: {
    backgroundColor: "#FFF4D6",
    color: "#7A5A00",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  heading: {
    fontSize: 24,
    fontWeight: "600",
    marginTop: 8,
  },
  centered: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 12,
  },
  muted: {
    fontSize: 14,
    color: "#666",
  },
  error: {
    color: "#c0392b",
    textAlign: "center",
  },
  retry: {
    borderWidth: 1,
    borderColor: "#208AEF",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  retryText: {
    color: "#208AEF",
    fontWeight: "600",
  },
  card: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  cardDisabled: {
    opacity: 0.5,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
  },
  status: {
    fontSize: 12,
    fontWeight: "600",
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 8,
    overflow: "hidden",
  },
  status_active: {
    backgroundColor: "#DFF5E3",
    color: "#1E7B34",
  },
  status_upcoming: {
    backgroundColor: "#E6F4FE",
    color: "#1565A8",
  },
  status_completed: {
    backgroundColor: "#EEE",
    color: "#666",
  },
});
