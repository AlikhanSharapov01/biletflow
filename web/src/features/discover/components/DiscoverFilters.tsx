import { categoryName, t, useLocale } from "../../../i18n";
import type { FormEvent } from "react";
import type { Category } from "../../../api/types";
import { Button } from "../../../components/ui/Button";
import { SelectField } from "../../../components/ui/Field";

interface DiscoverFiltersProps {
  q: string;
  categoryId: string;
  categories: Category[];
  onSearch: (filters: { q: string; category: string }) => void;
}

// Title search and category filter. Inputs are uncontrolled and re-keyed when
// the URL changes, so back/forward navigation restores them.
export function DiscoverFilters({ q, categoryId, categories, onSearch }: DiscoverFiltersProps) {
  useLocale();
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSearch({ q: String(data.get("q") ?? "").trim(), category: String(data.get("category") ?? "") });
  };

  return (
    <form className="panel discover-filters" onSubmit={handleSubmit}>
      <label className="search-box">
        <span aria-hidden="true">⌕</span>
        <input name="q" defaultValue={q} key={q} placeholder={t("discover.search_titles")} aria-label={t("discover.search_events")} />
      </label>
      <SelectField label={t("discover.category")} name="category" defaultValue={categoryId} key={`${categoryId}-${categories.length}`}>
        <option value="">{t("discover.all_categories")}</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {categoryName(category)}
          </option>
        ))}
      </SelectField>
      <Button variant="primary" type="submit">{t("discover.search_events")}</Button>
    </form>
  );
}
