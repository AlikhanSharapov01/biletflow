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
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSearch({ q: String(data.get("q") ?? "").trim(), category: String(data.get("category") ?? "") });
  };

  return (
    <form className="panel discover-filters" onSubmit={handleSubmit}>
      <label className="search-box">
        <span aria-hidden="true">⌕</span>
        <input name="q" defaultValue={q} key={q} placeholder="Search event titles" aria-label="Search events" />
      </label>
      <SelectField label="Category" name="category" defaultValue={categoryId} key={`${categoryId}-${categories.length}`}>
        <option value="">All categories</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name_en}
          </option>
        ))}
      </SelectField>
      <Button variant="primary" type="submit">
        Search events
      </Button>
    </form>
  );
}
