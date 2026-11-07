import { useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";

import type { EventFilters } from "@/api/types/catalog";
import { Screen, TopBar } from "@/components/layout";
import { EmptyState, ErrorPanel, LoadingState, PageHeading } from "@/components/ui";
import { DiscoverFilters } from "@/features/discover/DiscoverFilters";
import { EventCard } from "@/features/discover/EventCard";
import { useDiscoverCatalog } from "@/features/discover/useDiscoverCatalog";
import { colors, fonts } from "@/theme";
import { formatEventWindow } from "@/utils/eventTime";

// Published events with title search and a category filter — the web
// Discover page (web/src/live.js loadDiscovery). Filters apply on "Search
// events", like the web form.
export function DiscoverScreen() {
  const [draft, setDraft] = useState<EventFilters>({ q: "", categoryId: "" });
  const [filters, setFilters] = useState<EventFilters>({ q: "", categoryId: "" });
  const { catalog, error, loading, refreshing, refresh, lookup } = useDiscoverCatalog(filters);

  const header = (
    <View>
      <TopBar />
      <PageHeading
        eyebrow="Your city, in good company"
        title="Find your next moment."
        subtitle="Discover what’s happening around you, from the people bringing it to life."
      />
      <DiscoverFilters
        draft={draft}
        onDraftChange={setDraft}
        onApply={() => setFilters({ ...draft, q: draft.q.trim() })}
        categories={catalog?.categories ?? []}
        loading={loading && catalog !== null}
      />
    </View>
  );

  let emptyState;
  if (error) {
    emptyState = (
      <ErrorPanel
        title="We couldn’t load discover events."
        message={error}
        onRetry={() => setFilters({ ...filters })}
      />
    );
  } else if (catalog === null) {
    emptyState = <LoadingState message="Loading discover events…" />;
  } else {
    emptyState = (
      <EmptyState message="No events match those filters yet. Try another search or check back soon." />
    );
  }

  return (
    <Screen>
      <FlatList
        data={error ? [] : (catalog?.events ?? [])}
        keyExtractor={(event) => event.id}
        ListHeaderComponent={header}
        ListEmptyComponent={emptyState}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.green} />
        }
        renderItem={({ item: event, index }) => {
          const venue = lookup.venue.get(event.venue_id);
          const category = lookup.category.get(event.category_id);
          return (
            <EventCard
              index={index}
              category={category?.name_en || "Community"}
              title={event.title}
              meta={`${formatEventWindow(event.starts_at, event.ends_at, event.time_zone)} · ${
                venue ? `${venue.name} · ${venue.city}` : "Venue details unavailable"
              }`}
              footer={
                <Text style={styles.price}>
                  {event.visibility === "public" ? "Tickets available" : "Event"}
                </Text>
              }
            />
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
    gap: 12,
  },
  price: {
    color: "#52645a",
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: "700",
  },
});
