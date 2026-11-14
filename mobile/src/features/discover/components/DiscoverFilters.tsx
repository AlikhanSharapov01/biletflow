import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import type { Category } from "@/api/types";
import { Panel, PrimaryButton, SelectField, fieldStyles } from "@/components/ui";
import { colors, fonts } from "@/theme";
import { t, useLocale } from "@/i18n";

export interface DiscoverQuery {
  q: string;
  category: string;
}

interface DiscoverFiltersProps {
  applied: DiscoverQuery;
  categories: Category[];
  loading: boolean;
  onSearch: (filters: DiscoverQuery) => void;
}

// Title search and category filter. Edits stay local until "Search events"
// (or the keyboard's search key) applies them, like the web form.
export function DiscoverFilters({ applied, categories, loading, onSearch }: DiscoverFiltersProps) {
  useLocale();
  const [q, setQ] = useState(applied.q);
  const [category, setCategory] = useState(applied.category);

  useEffect(() => {
    setQ(applied.q);
    setCategory(applied.category);
  }, [applied.q, applied.category]);

  const submit = () => onSearch({ q: q.trim(), category });

  return (
    <Panel style={styles.filters}>
      <View style={[fieldStyles.box, styles.search]}>
        <Text style={styles.searchIcon} accessibilityElementsHidden importantForAccessibility="no">
          ⌕
        </Text>
        <TextInput
          style={styles.searchInput}
          placeholder={t("discover.search_titles")}
          placeholderTextColor={colors.placeholder}
          accessibilityLabel={t("discover.search_events")}
          returnKeyType="search"
          value={q}
          onChangeText={setQ}
          onSubmitEditing={submit}
        />
      </View>
      <SelectField
        label={t("discover.category")}
        value={category}
        options={[{ value: "", label: t("discover.all_categories") }, ...categories.map((item) => ({ value: item.id, label: item.name_en }))]}
        onChange={setCategory}
      />
      <PrimaryButton label={t("discover.search_events")} onPress={submit} loading={loading} />
    </Panel>
  );
}

const styles = StyleSheet.create({
  filters: { gap: 12, marginBottom: 4 },
  search: { flexDirection: "row", alignItems: "center", gap: 8 },
  searchIcon: { color: colors.muted, fontSize: 16 },
  searchInput: { flex: 1, minHeight: 44, color: colors.ink, fontFamily: fonts.sans, fontSize: 15 },
});
