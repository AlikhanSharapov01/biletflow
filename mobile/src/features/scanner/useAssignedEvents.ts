import { useCallback, useEffect, useState } from "react";

import { listAssignedEvents } from "@/api/scanner";
import type { AssignedEvent } from "@/api/types/scanner";
import { sortForScanning } from "@/features/scanner/assignedEventStatus";

// Events this account may scan, in scanning order. `events` is null while
// loading; `reload` clears both and fetches again.
export function useAssignedEvents() {
  const [events, setEvents] = useState<AssignedEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    setEvents(null);
    try {
      setEvents(sortForScanning(await listAssignedEvents()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { events, error, reload };
}
