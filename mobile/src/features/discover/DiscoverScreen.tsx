import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";

import { listCategories, listEvents, listVenues } from "@/api/catalog";
import { Screen, TopBar } from "@/components/layout";
import { EmptyState, ErrorPanel, LoadingState, PageHeading, TextButton } from "@/components/ui";
import { useRequest } from "@/hooks/useRequest";
import { colors, fonts, spacing } from "@/theme";
import { dateLabel } from "@/utils/format";
import { DiscoverFilters, type DiscoverQuery } from "./components/DiscoverFilters";
import { EventCard } from "./components/EventCard";
import { t, useLocale } from "@/i18n";

// Published events with title search and a category filter (web DiscoverPage).
export function DiscoverScreen() {
  useLocale();
  const router = useRouter();
  const [query, setQuery] = useState<DiscoverQuery>({ q: "", category: "" });

  const page = useRequest(
    async () => {
      const [events, categories, venues] = await Promise.all([
        listEvents({ q: query.q || undefined, category_id: query.category || undefined }),
        listCategories(),
        listVenues(),
      ]);
      return { events, categories, venues };
    },
    [query.q, query.category],
  );

  const lookups = useMemo(() => {
    const venues = new Map(page.data?.venues.map((venue) => [venue.id, venue] as const) ?? []);
    const categories = new Map(page.data?.categories.map((category) => [category.id, category] as const) ?? []);
    return { venues, categories };
  }, [page.data]);

  const openEvent = (eventId: string) => router.push({ pathname: "/events/[eventId]", params: { eventId } });

  const header = (
    <View>
      <TopBar />
      <PageHeading
        eyebrow={t("discover.eyebrow")}
        title={t("discover.title")}
        subtitle={t("discover.subtitle")}
      />
      <DiscoverFilters
        applied={query}
        categories={page.data?.categories ?? []}
        loading={page.loading && page.data !== null}
        onSearch={(next) => setQuery(next)}
      />
    </View>
  );

  let empty;
  if (page.error) {
    empty = <ErrorPanel title={t("discover.load_error")} message={page.error} onRetry={page.reload} />;
  } else if (!page.data) {
    empty = <LoadingState message={t("discover.loading")} />;
  } else {
    empty = <EmptyState message={t("discover.empty")} />;
  }

  return (
    <Screen>
      <FlatList
        data={page.error ? [] : (page.data?.events ?? [])}
        keyExtractor={(event) => event.id}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={page.loading && page.data !== null} onRefresh={page.reload} tintColor={colors.green} />
        }
        renderItem={({ item: event, index }) => {
          const venue = lookups.venues.get(event.venue_id);
          const categoryName = lookups.categories.get(event.category_id)?.name_en ?? t("common.community");
          return (
            <EventCard
              index={index}
              category={categoryName}
              title={event.title}
              meta={`${dateLabel(event.starts_at)} · ${venue ? `${venue.name} · ${venue.city}` : t("discover.venue_missing")}`}
              onPress={() => openEvent(event.id)}
              footer={
                <>
                  <Text style={styles.price}>{event.time_status === "completed" ? t("common.completed") : t("discover.tickets_available")}</Text>
                  <TextButton label={t("discover.view_event")} onPress={() => openEvent(event.id)} />
                </>
              }
            />
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.gutter, paddingBottom: 32, gap: spacing.gap },
  price: { color: colors.green, fontFamily: fonts.sans, fontSize: 13, fontWeight: "700" },
});
