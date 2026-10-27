import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";

import {
  listCategories,
  listEvents,
  listVenues,
  type CatalogEvent,
  type Category,
  type EventFilters,
  type Venue,
} from "@/api/catalog";
import { SessionExpiredError } from "@/api/session";
import { EventCard } from "@/components/EventCard";
import { TopBar } from "@/components/TopBar";
import {
  EmptyState,
  ErrorPanel,
  LoadingState,
  PageHeading,
  Panel,
  PrimaryButton,
  Screen,
  SelectField,
  fieldStyles,
} from "@/components/ui";
import { colors, fonts } from "@/theme";
import { formatEventWindow } from "@/utils/eventTime";

type Catalog = {
  events: CatalogEvent[];
  categories: Category[];
  venues: Venue[];
};

// Published events with title search and a category filter — the web
// Discover page (web/src/live.js loadDiscovery). Filters apply on "Search
// events", like the web form.
export default function Discover() {
  const [draft, setDraft] = useState<EventFilters>({ q: "", categoryId: "" });
  const [filters, setFilters] = useState<EventFilters>({ q: "", categoryId: "" });
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (active: EventFilters) => {
    setError(null);
    try {
      const [events, categories, venues] = await Promise.all([
        listEvents(active),
        listCategories(),
        listVenues(),
      ]);
      setCatalog({ events, categories, venues });
    } catch (err) {
      // Session couldn't be renewed: AuthContext is already redirecting to login.
      if (err instanceof SessionExpiredError) return;
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load(filters).finally(() => setLoading(false));
  }, [filters, load]);

  async function refresh() {
    setRefreshing(true);
    await load(filters);
    setRefreshing(false);
  }

  const lookup = useMemo(
    () => ({
      venue: new Map(catalog?.venues.map((venue) => [venue.id, venue])),
      category: new Map(catalog?.categories.map((category) => [category.id, category])),
    }),
    [catalog]
  );

  const categoryOptions = [
    { value: "", label: "All categories" },
    ...(catalog?.categories ?? []).map((category) => ({
      value: category.id,
      label: category.name_en,
    })),
  ];

  const header = (
    <View>
      <TopBar />
      <PageHeading
        eyebrow="Your city, in good company"
        title="Find your next moment."
        subtitle="Discover what’s happening around you, from the people bringing it to life."
      />
      <Panel style={styles.filters}>
        <View style={[fieldStyles.box, styles.search]}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search event titles"
            placeholderTextColor={colors.placeholder}
            accessibilityLabel="Search events"
            returnKeyType="search"
            value={draft.q}
            onChangeText={(q) => setDraft((current) => ({ ...current, q }))}
            onSubmitEditing={() => setFilters({ ...draft, q: draft.q.trim() })}
          />
        </View>
        <SelectField
          label="Category"
          value={draft.categoryId}
          options={categoryOptions}
          onChange={(categoryId) => setDraft((current) => ({ ...current, categoryId }))}
        />
        <PrimaryButton
          label="Search events"
          onPress={() => setFilters({ ...draft, q: draft.q.trim() })}
          loading={loading && catalog !== null}
        />
      </Panel>
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
  filters: {
    gap: 12,
    marginBottom: 4,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchIcon: {
    color: "#829087",
    fontSize: 16,
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 15,
  },
  price: {
    color: "#52645a",
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: "700",
  },
});
