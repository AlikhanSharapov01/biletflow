import type { SupportThreadItem } from "../../api/types/support";

// Adds newly received items to the thread. Polling pages can overlap and a
// sent message also arrives through /updates, so items are keyed by `seq`.
export function mergeThreadItems(current: SupportThreadItem[], incoming: SupportThreadItem[]): SupportThreadItem[] {
  if (incoming.length === 0) return current;
  const bySeq = new Map<number, SupportThreadItem>();
  for (const item of current) bySeq.set(item.seq, item);
  let changed = false;
  for (const item of incoming) {
    if (!bySeq.has(item.seq)) {
      bySeq.set(item.seq, item);
      changed = true;
    }
  }
  if (!changed) return current;
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

export function lastSeq(items: SupportThreadItem[]): number {
  return items.reduce((highest, item) => Math.max(highest, item.seq), 0);
}
