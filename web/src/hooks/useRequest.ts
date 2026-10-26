import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";
import { describeError } from "../api/errors";

export interface RequestState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

// Runs an async loader when its dependencies change and exposes the result.
// Stale responses are ignored, so quick navigation never shows the wrong page.
export function useRequest<T>(load: () => Promise<T>, deps: DependencyList): RequestState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const loader = useRef(load);
  loader.current = load;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    loader
      .current()
      .then((result) => {
        if (!active) return;
        setData(result);
        setLoading(false);
      })
      .catch((failure: unknown) => {
        if (!active) return;
        setError(describeError(failure));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [...deps, version]);

  const reload = useCallback(() => setVersion((current) => current + 1), []);

  return { data, error, loading, reload };
}
