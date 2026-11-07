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
export function Pagination({ total, limit, offset, shown, onChange, label = "Pages" }: PaginationProps) {
  const info = pageInfo(total, limit, offset, shown);
  return (
    <nav className="pagination" aria-label={label}>
      <span className="pagination-count" aria-live="polite">
        {info.total === 0 ? "No results" : `${info.from}–${info.to} of ${info.total}`}
      </span>
      <Button size="sm" disabled={!info.hasPrevious} onClick={() => onChange(info.previousOffset)}>
        Previous
      </Button>
      <Button size="sm" disabled={!info.hasNext} onClick={() => onChange(info.nextOffset)}>
        Next
      </Button>
    </nav>
  );
}
