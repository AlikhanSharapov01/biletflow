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

export function pageInfo(total: number, limit: number, offset: number, shown: number): PageInfo {
  const from = shown === 0 ? 0 : offset + 1;
  return {
    from,
    to: offset + shown,
    total,
    hasPrevious: offset > 0,
    hasNext: offset + shown < total,
    previousOffset: Math.max(0, offset - limit),
    nextOffset: offset + limit,
  };
}
