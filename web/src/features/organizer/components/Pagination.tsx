import { t, useLocale } from "../../../i18n";
import { Button } from "../../../components/ui";
import { pageInfo } from "../utils/paging";

interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
  shown: number;
  onChange: (offset: number) => void;
  label?: string;
}

// "1–50 of 230" with Previous / Next, for `{items, total, limit, offset}` lists.
// A page that comes back empty while total > 0 says so and keeps Previous enabled.
export function Pagination({ total, limit, offset, shown, onChange, label = t("org.pages") }: PaginationProps) {
  useLocale();
  const info = pageInfo(total, limit, offset, shown);
  return (
    <nav className="pagination" aria-label={label}>
      <span className="pagination-count" aria-live="polite">
        {info.total === 0
          ? t("org.no_results")
          : info.to === 0
            ? t("org.no_results_page", { p0: info.total })
            : t("org.result_range", { p0: info.from, p1: info.to, p2: info.total })}
      </span>
      <Button size="sm" disabled={!info.hasPrevious} onClick={() => onChange(info.previousOffset)}>{t("common.previous")}</Button>
      <Button size="sm" disabled={!info.hasNext} onClick={() => onChange(info.nextOffset)}>{t("common.next")}</Button>
    </nav>
  );
}
