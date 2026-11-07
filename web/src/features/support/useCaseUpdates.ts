import { useCallback, useEffect, useRef, useState } from "react";
import { describeError } from "../../api/errors";
import { caseUpdates } from "../../api/support";
import type { SupportThreadItem } from "../../api/types/support";
import { lastSeq, mergeThreadItems } from "./thread";

const POLL_MS = 5000;

interface CaseUpdates {
  items: SupportThreadItem[];
  loading: boolean;
  error: string | null;
  // Adds an item we already have (e.g. the response to our own send).
  add: (item: SupportThreadItem) => void;
}

// Messages and history for one case, kept current by polling
// `/updates?after=<seq>` every few seconds while the tab is visible. `onChange`
// runs when a status, assignment or escalation item arrives so the header can
// refresh.
export function useCaseUpdates(caseId: string, onChange: () => void): CaseUpdates {
  const [items, setItems] = useState<SupportThreadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cursor = useRef(0);
  const inFlight = useRef(false);
  const changeHandler = useRef(onChange);
  changeHandler.current = onChange;

  const add = useCallback((item: SupportThreadItem) => {
    setItems((current) => mergeThreadItems(current, [item]));
  }, []);

  useEffect(() => {
    let active = true;
    cursor.current = 0;
    setItems([]);
    setLoading(true);
    setError(null);

    const poll = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        let more = true;
        let sawChange = false;
        while (more && active) {
          const page = await caseUpdates(caseId, cursor.current);
          if (!active) return;
          cursor.current = Math.max(cursor.current, page.next_after, lastSeq(page.items));
          sawChange ||= page.items.some((item) => item.type === "change");
          setItems((current) => mergeThreadItems(current, page.items));
          more = page.has_more && page.items.length > 0;
        }
        if (active) setError(null);
        if (active && sawChange) changeHandler.current();
      } catch (failure) {
        if (active) setError(describeError(failure));
      } finally {
        inFlight.current = false;
        if (active) setLoading(false);
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void poll();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [caseId]);

  return { items, loading, error, add };
}
