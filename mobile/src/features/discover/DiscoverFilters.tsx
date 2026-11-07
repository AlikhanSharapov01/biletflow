import { StyleSheet, Text, TextInput, View } from "react-native";

import type { Category, EventFilters } from "@/api/types/catalog";
import { Panel, PrimaryButton, SelectField, fieldStyles } from "@/components/ui";
import { colors, fonts } from "@/theme";

// Title search + category picker. Edits stay in `draft` until "Search
// events" (or the keyboard's search key) applies them, like the web form.
export function DiscoverFilters({
  draft,
  onDraftChange,
  onApply,
  categories,
  loading,
}: {
  draft: EventFilters;
  onDraftChange: (update: (current: EventFilters) => EventFilters) => void;
  onApply: () => void;
  categories: Category[];
  loading: boolean;
}) {
  const categoryOptions = [
    { value: "", label: "All categories" },
    ...categories.map((category) => ({
      value: category.id,
      label: category.name_en,
    })),
  ];

  return (
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
          onChangeText={(q) => onDraftChange((current) => ({ ...current, q }))}
          onSubmitEditing={onApply}
        />
      </View>
      <SelectField
        label="Category"
        value={draft.categoryId}
        options={categoryOptions}
        onChange={(categoryId) => onDraftChange((current) => ({ ...current, categoryId }))}
      />
      <PrimaryButton label="Search events" onPress={onApply} loading={loading} />
    </Panel>
  );
}

const styles = StyleSheet.create({
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
});
