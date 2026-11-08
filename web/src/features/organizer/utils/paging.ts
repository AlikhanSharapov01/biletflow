// Offset paging shared by the check-in log and the admin search lists.

export interface PageInfo {
  from: number;
  to: number;
  total: number;
  hasPrevious: boolean;
  hasNext: boolean;
  previousOffset: number;
  nextOffset: number;
}

// An empty page (none shown) has `from` and `to` of 0, even when `total` is
// above 0 because rows were removed while paging. Previous then goes back to
// the last page that still has rows instead of another empty one, and Next is
// off so an empty page never links to a further empty page.
export function pageInfo(total: number, limit: number, offset: number, shown: number): PageInfo {
  const empty = shown === 0;
  const lastPageOffset = total > 0 && limit > 0 ? Math.floor((total - 1) / limit) * limit : 0;
  return {
    from: empty ? 0 : offset + 1,
    to: empty ? 0 : offset + shown,
    total,
    hasPrevious: offset > 0,
    hasNext: !empty && offset + shown < total,
    previousOffset: Math.max(0, Math.min(offset - limit, lastPageOffset)),
    nextOffset: offset + limit,
  };
}
