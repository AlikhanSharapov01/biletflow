import { useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { categoryName, getLocale, t, useLocale, type TranslationKey } from "../../../i18n";
import type { Category } from "../../../api/types";
import { Button } from "../../../components/ui/Button";
import { CheckboxField, SelectField, TextField } from "../../../components/ui/Field";
import {
  cityOptions,
  discoverSearchParams,
  hasActiveFilters,
  normalisePrice,
  priceRangeError,
  type DiscoverQuery,
  type DiscoverWhen,
} from "../discoverQuery";

const PHONE = "(max-width: 760px)";
const MAX_PRICE = "999999999";

const WHEN_LABELS: ReadonlyArray<[DiscoverWhen, TranslationKey]> = [
  ["", "discover.when_any"],
  ["today", "discover.when_today"],
  ["weekend", "discover.when_weekend"],
  ["month", "discover.when_month"],
];

function subscribePhone(listener: () => void) {
  const media = window.matchMedia?.(PHONE);
  media?.addEventListener("change", listener);
  return () => media?.removeEventListener("change", listener);
}
const isPhone = () => window.matchMedia?.(PHONE).matches ?? false;

/** How many of the filters inside "More filters" are set. */
export function moreFiltersCount(query: DiscoverQuery): number {
  const price = !query.free && (query.minPrice || query.maxPrice);
  return [query.city, query.when, query.free, price].filter(Boolean).length;
}

interface DiscoverFiltersProps {
  query: DiscoverQuery;
  categories: Category[];
  /** Cities of the venues loaded so far. */
  cities: string[];
  onSearch: (query: DiscoverQuery) => void;
  onClear: () => void;
}

// Inputs are uncontrolled and the form is re-keyed when the URL changes, so
// back/forward navigation restores them.
export function DiscoverFilters(props: DiscoverFiltersProps) {
  return <FilterForm key={discoverSearchParams(props.query).toString()} {...props} />;
}

function FilterForm({ query, categories, cities, onSearch, onClear }: DiscoverFiltersProps) {
  useLocale();
  const phone = useSyncExternalStore(subscribePhone, isPhone, () => false);
  const activeMore = moreFiltersCount(query);
  const [opened, setOpened] = useState(activeMore > 0);
  const [free, setFree] = useState(query.free);
  const [submitError, setSubmitError] = useState<TranslationKey | null>(null);
  const details = useRef<HTMLDetailsElement>(null);
  const city = cityOptions(cities, query.city, getLocale());
  const rangeError = submitError ?? priceRangeError(query);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const isFree = data.get("free") === "1";
    const next: DiscoverQuery = {
      q: String(data.get("q") ?? "").trim(),
      category: String(data.get("category") ?? ""),
      city: String(data.get("city") ?? ""),
      when: String(data.get("when") ?? "") as DiscoverWhen,
      free: isFree,
      minPrice: isFree ? "" : normalisePrice(String(data.get("min_price") ?? "")),
      maxPrice: isFree ? "" : normalisePrice(String(data.get("max_price") ?? "")),
    };
    const error = priceRangeError(next);
    setSubmitError(error);
    if (error) {
      setOpened(true);
      if (details.current) details.current.open = true;
      (form.elements.namedItem("max_price") as HTMLInputElement | null)?.focus();
      return;
    }
    onSearch(next);
  };

  return (
    <form className="panel discover-filters" onSubmit={handleSubmit}>
      <label className="search-box">
        <span aria-hidden="true">⌕</span>
        <input name="q" defaultValue={query.q} maxLength={200} placeholder={t("discover.search_titles")} aria-label={t("discover.search_events")} />
      </label>
      <SelectField label={t("discover.category")} name="category" defaultValue={query.category} key={`${query.category}-${categories.length}`}>
        <option value="">{t("discover.all_categories")}</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {categoryName(category)}
          </option>
        ))}
      </SelectField>
      <div className="filter-actions">
        <Button variant="primary" type="submit">{t("discover.search_events")}</Button>
        {hasActiveFilters(query) ? <Button onClick={onClear}>{t("discover.clear_filters")}</Button> : null}
      </div>
      <details
        ref={details}
        className="more-filters"
        open={phone ? opened : true}
        onToggle={(event) => {
          if (phone) setOpened(event.currentTarget.open);
        }}
      >
        <summary>{activeMore ? t("discover.more_filters_count", { count: activeMore }) : t("discover.more_filters")}</summary>
        <div className="more-filters-body">
          <SelectField label={t("discover.city")} name="city" defaultValue={city.value} key={`${city.value}-${city.options.length}`}>
            <option value="">{t("discover.all_cities")}</option>
            {city.options.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </SelectField>
          <SelectField label={t("discover.when")} name="when" defaultValue={query.when}>
            {WHEN_LABELS.map(([value, label]) => (
              <option key={value} value={value}>{t(label)}</option>
            ))}
          </SelectField>
          <CheckboxField label={t("discover.free_only")} name="free" value="1" checked={free} onChange={(event) => setFree(event.target.checked)} />
          <div className="price-range" hidden={free}>
            <TextField
              label={t("discover.price_from")}
              name="min_price"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_PRICE}
              step={1}
              defaultValue={query.minPrice}
              disabled={free}
            />
            <TextField
              label={t("discover.price_to")}
              name="max_price"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_PRICE}
              step={1}
              defaultValue={query.maxPrice}
              disabled={free}
              aria-invalid={rangeError ? true : undefined}
              aria-describedby={rangeError ? "discover-price-error" : undefined}
            />
            {rangeError ? <p className="form-message price-error" id="discover-price-error">{t(rangeError)}</p> : null}
          </div>
        </div>
      </details>
    </form>
  );
}
