import { Fragment, useState, useSyncExternalStore, type FormEvent, type RefObject } from "react";
import { flushSync } from "react-dom";
import { categoryName, getLocale, t, useLocale, type TranslationKey } from "../../../i18n";
import type { Category } from "../../../api/types";
import { Button } from "../../../components/ui/Button";
import { CheckboxField, SelectField, TextField } from "../../../components/ui/Field";
import {
  cityOptions,
  discoverSearchParams,
  hasActiveFilters,
  moreFiltersCount,
  parseDiscoverQuery,
  priceRangeError,
  type DiscoverQuery,
  type DiscoverWhen,
} from "../discoverQuery";

// Must match the `max-width: 760px` media queries for the Discover filters in styles/events.css.
const PHONE = "(max-width: 760px)";
const MAX_PRICE = "999999999";
const PRICE_ERROR_ID = "discover-price-error";

const WHEN_LABELS: ReadonlyArray<[DiscoverWhen, TranslationKey]> = [
  ["", "discover.when_any"],
  ["today", "discover.when_today"],
  ["weekend", "discover.when_weekend"],
  ["month", "discover.when_month"],
];

type PriceField = "min_price" | "max_price";
interface PriceError {
  field: PriceField;
  message: TranslationKey;
}

function subscribePhone(listener: () => void) {
  const media = window.matchMedia?.(PHONE);
  media?.addEventListener("change", listener);
  return () => media?.removeEventListener("change", listener);
}
const isPhone = () => window.matchMedia?.(PHONE).matches ?? false;

interface DiscoverFiltersProps {
  query: DiscoverQuery;
  categories: Category[];
  /** Cities of the venues loaded so far. */
  cities: string[];
  /** The search box, so the page can focus it after Clear filters. */
  searchRef: RefObject<HTMLInputElement | null>;
  onSearch: (query: DiscoverQuery) => void;
  onClear: () => void;
}

// The form and its buttons stay mounted. The inputs are uncontrolled and re-keyed
// when the URL changes by anything other than this form's own submit, so Back and
// Forward restore them while a submit never drops the focus.
export function DiscoverFilters({ query, categories, cities, searchRef, onSearch, onClear }: DiscoverFiltersProps) {
  useLocale();
  const phone = useSyncExternalStore(subscribePhone, isPhone, () => false);
  const key = discoverSearchParams(query).toString();
  const [seenKey, setSeenKey] = useState(key);
  const [epoch, setEpoch] = useState(0);
  const [ownKey, setOwnKey] = useState<string | null>(null);
  const [opened, setOpened] = useState(moreFiltersCount(query) > 0);
  const [free, setFree] = useState(query.free);
  const [submitError, setSubmitError] = useState<PriceError | null>(null);

  if (key !== seenKey) {
    setSeenKey(key);
    if (key === ownKey) {
      setOwnKey(null);
    } else {
      setEpoch((value) => value + 1);
      setOpened(moreFiltersCount(query) > 0);
      setFree(query.free);
      setSubmitError(null);
    }
  }

  const activeMore = moreFiltersCount(query);
  const city = cityOptions(cities, query.city, getLocale());
  const urlError = priceRangeError(query);
  const priceError: PriceError | null = submitError ?? (urlError ? { field: "max_price", message: urlError } : null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const raw = new URLSearchParams();
    for (const [name, value] of new FormData(form)) {
      if (typeof value === "string") raw.set(name, name === "q" ? value.trim() : value);
    }
    let error: PriceError | null = null;
    // The form is not natively validated (the browser's bubble would hide a collapsed field).
    // A number input accepts "1e5"; read its value as a number and send whole tenge.
    for (const field of ["min_price", "max_price"] as const) {
      const input = form.elements.namedItem(field) as HTMLInputElement;
      const malformed = input.validity.badInput;
      if (input.disabled || (!malformed && !input.value.trim())) continue;
      const amount = input.valueAsNumber;
      if (!malformed && Number.isSafeInteger(amount) && amount >= 0 && amount <= Number(MAX_PRICE)) raw.set(field, String(amount));
      else error ??= { field, message: "discover.price_invalid" };
    }
    const next = parseDiscoverQuery(raw);
    const rangeError = priceRangeError(next);
    error ??= rangeError ? { field: "max_price", message: rangeError } : null;
    // Commit the error before focusing, so a screen reader reads it with the field.
    flushSync(() => {
      setSubmitError(error);
      if (error) setOpened(true);
    });
    if (error) {
      const input = form.elements.namedItem(error.field) as HTMLInputElement;
      input.focus();
      input.scrollIntoView?.({ block: "center" });
      return;
    }
    const nextKey = discoverSearchParams(next).toString();
    if (nextKey !== key) setOwnKey(nextKey);
    onSearch(next);
  };

  const invalid = (field: PriceField) => (priceError?.field === field ? true : undefined);
  const describedBy = (field: PriceField) => (priceError?.field === field ? PRICE_ERROR_ID : undefined);

  return (
    <form className="panel discover-filters" onSubmit={handleSubmit} noValidate>
      <Fragment key={`search-${epoch}`}>
        <label className="search-box">
          <span aria-hidden="true">⌕</span>
          <input
            ref={searchRef}
            name="q"
            defaultValue={query.q}
            maxLength={200}
            placeholder={t("discover.search_titles")}
            aria-label={t("discover.search_events")}
          />
        </label>
        <SelectField label={t("discover.category")} name="category" defaultValue={query.category} key={categories.length}>
          <option value="">{t("discover.all_categories")}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {categoryName(category)}
            </option>
          ))}
        </SelectField>
      </Fragment>
      <div className="filter-actions">
        <Button variant="primary" type="submit">{t("discover.search_events")}</Button>
        {hasActiveFilters(query) ? <Button onClick={onClear}>{t("discover.clear_filters")}</Button> : null}
      </div>
      <details
        key={`more-${epoch}`}
        className="more-filters"
        open={phone ? opened : true}
        onToggle={(event) => {
          if (phone) setOpened(event.currentTarget.open);
        }}
      >
        <summary>
          {activeMore ? t("discover.more_filters_count", { count: activeMore }) : t("discover.more_filters")}
          <svg className="chevron" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
            <path d="m5 8 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </summary>
        <div className="more-filters-body">
          <SelectField label={t("discover.city")} name="city" defaultValue={city.value} key={city.options.length}>
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
              aria-invalid={invalid("min_price")}
              aria-describedby={describedBy("min_price")}
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
              aria-invalid={invalid("max_price")}
              aria-describedby={describedBy("max_price")}
            />
            {priceError ? <p className="form-message price-error" id={PRICE_ERROR_ID} role="alert">{t(priceError.message)}</p> : null}
          </div>
        </div>
      </details>
    </form>
  );
}
